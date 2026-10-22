import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { sendEmail, orderStatusEmail } from '../services/email.js';
import { giftCardEmail } from './giftcards.js';
import { awardLoyaltyPoints, restoreOrderBenefits } from './orders.js';

const router = Router();

/*
  POST /api/webhooks/razorpay
  ------------------------------------------------------------------
  Server-to-server reconciliation, independent of whether the
  customer's browser ever came back after paying. Handles the cases
  client-side verification alone can't: tab closed after payment,
  frontend crash, network drop right after payment, delayed webhook
  delivery, and refund events.

  IMPORTANT: this route is mounted in server.js BEFORE the global
  express.json() middleware and uses express.raw() itself, because
  Razorpay's signature is computed over the exact raw request body —
  if JSON middleware parses and re-serializes it first, the bytes
  Razorpay signed no longer match and every webhook would fail
  verification.

  Set the webhook secret in Razorpay's dashboard (Settings > Webhooks)
  and put the same value in RAZORPAY_WEBHOOK_SECRET. Without it, this
  endpoint safely no-ops (nothing breaks — you just don't get
  server-side reconciliation until it's configured).
  ------------------------------------------------------------------
*/
router.post('/razorpay', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.');
    return res.status(200).json({ ok: true, ignored: true });
  }

  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw() in server.js

  if (!signature || !Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ message: 'Missing signature or body' });
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signature);
  const valid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

  if (!valid) {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  // Acknowledge immediately — Razorpay retries on non-2xx, and we don't
  // want a slow/failed downstream step to trigger duplicate retries for
  // an event we already understood.
  res.status(200).json({ ok: true });

  try {
    await reconcile(event);
  } catch (e) {
    console.error('RAZORPAY WEBHOOK RECONCILE ERROR:', e.message);
  }
});

async function reconcile(event) {
  const type = event.event;
  const payment = event.payload?.payment?.entity;
  const refund = event.payload?.refund?.entity;

  if (type === 'payment.captured' && payment?.order_id) {
    // Belt-and-suspenders alongside /orders/verify-payment: if the
    // customer's browser never made it back to call verify-payment
    // (closed tab, crash, dropped network), this catches it anyway —
    // and now does the FULL success sequence, not just the status
    // flip: loyalty points, exactly like the normal verified-payment
    // path, so a browser-closed order isn't missing points forever.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM orders WHERE razorpay_order_id = $1 FOR UPDATE`,
        [payment.order_id]
      );
      const order = rows[0];
      if (order && order.payment_status !== 'paid' && order.status !== 'cancelled') {
        await client.query(
          `UPDATE orders SET payment_status = 'paid', status = 'processing', razorpay_payment_id = $2 WHERE id = $1`,
          [order.id, payment.id]
        );
        await awardLoyaltyPoints(client, order.id);
        console.log(`Webhook reconciled payment + loyalty points for order ${order.id} (browser never confirmed).`);
      }
      // Same catch-up for a pending gift card purchase — including
      // actually emailing the recipient, which the browser-side flow
      // would normally have done.
      const gc = await client.query(
        `SELECT * FROM gift_cards WHERE razorpay_order_id = $1 FOR UPDATE`,
        [payment.order_id]
      );
      if (gc.rows[0] && gc.rows[0].payment_status !== 'paid') {
        const updatedCard = await client.query(
          `UPDATE gift_cards
           SET balance = initial_value, active = TRUE, payment_status = 'paid', razorpay_payment_id = $2
           WHERE id = $1 RETURNING *`,
          [gc.rows[0].id, payment.id]
        );
        const card = updatedCard.rows[0];
        const { subject, html } = giftCardEmail(card);
        sendEmail({ to: card.recipient_email, subject, html }).catch(() => {});
        console.log(`Webhook reconciled + emailed gift card ${card.code} (browser never confirmed).`);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  if (type === 'payment.failed' && payment?.order_id) {
    // Mirrors PATCH /orders/:id/payment-cancel exactly — restores
    // stock, loyalty points spent, coupon usage, and gift card
    // balance, then cancels the order. Previously this only flipped
    // payment_status to 'failed' and left everything else reserved,
    // so a failed payment silently held stock and a spent gift card
    // balance hostage until someone noticed.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM orders WHERE razorpay_order_id = $1 AND payment_status <> 'paid' AND status <> 'cancelled' FOR UPDATE`,
        [payment.order_id]
      );
      const order = rows[0];
      if (order) {
        await restoreOrderBenefits(client, order);
        const updated = await client.query(
          `UPDATE orders SET status = 'cancelled', payment_status = 'failed' WHERE id = $1 RETURNING *`,
          [order.id]
        );
        await client.query('COMMIT');

        const finalOrder = updated.rows[0];
        if (finalOrder.shipping_email) {
          const { subject, html } = orderStatusEmail({ ...finalOrder, status: 'payment_failed' });
          sendEmail({ to: finalOrder.shipping_email, subject, html }).catch(() => {});
        }
        console.log(`Webhook reconciled failed payment for order ${order.id} — stock/points/coupon/gift card restored.`);
      } else {
        await client.query('ROLLBACK');
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  if (type === 'refund.processed' && refund) {
    // Reconciles a refund that was actually issued through Razorpay
    // (see POST /api/returns/:id/refund) — marks it settled once
    // Razorpay confirms the money actually moved.
    await pool.query(
      `UPDATE returns SET refund_settled_at = NOW() WHERE razorpay_refund_id = $1`,
      [refund.id]
    );
  }
}

export default router;
