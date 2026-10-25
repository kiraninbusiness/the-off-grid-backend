import { Router } from 'express';
import { pool } from '../db.js';
import { sendEmail, orderStatusEmail } from '../services/email.js';
import { giftCardEmail } from './giftcards.js';
import { verifyRazorpayWebhookSignature, webhookEventId } from '../services/webhookSecurity.js';
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
  and put the same value in RAZORPAY_WEBHOOK_SECRET. If it is missing,
  this endpoint returns 503 rather than falsely acknowledging a payment
  event; configure the secret before enabling Razorpay webhooks.
  ------------------------------------------------------------------
*/
router.post('/razorpay', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.');
    return res.status(503).json({ message: 'Razorpay webhook verification is not configured.' });
  }

  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body;
  if (!signature || !Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ message: 'Missing signature or body' });
  }

  if (!verifyRazorpayWebhookSignature(rawBody, signature, secret)) {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  const headerEventId = req.headers['x-razorpay-event-id'];
  const eventId = webhookEventId(rawBody, headerEventId);
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    // Serialize duplicate deliveries of the same event, including across app instances.
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [eventId]);
    lockAcquired = true;
    const prior = await client.query('SELECT status FROM razorpay_webhook_events WHERE event_id = $1', [eventId]);
    if (prior.rows[0]?.status === 'processed') {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    await client.query(
      `INSERT INTO razorpay_webhook_events (event_id, event_type, payload, status, attempts, last_error)
       VALUES ($1,$2,$3::jsonb,'processing',1,NULL)
       ON CONFLICT (event_id) DO UPDATE SET
         event_type = EXCLUDED.event_type,
         payload = EXCLUDED.payload,
         status = 'processing',
         attempts = razorpay_webhook_events.attempts + 1,
         last_error = NULL`,
      [eventId, String(event.event || 'unknown'), JSON.stringify(event)]
    );

    await reconcile(event);
    await client.query(
      `UPDATE razorpay_webhook_events
       SET status = 'processed', processed_at = NOW(), last_error = NULL
       WHERE event_id = $1`,
      [eventId]
    );
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('RAZORPAY WEBHOOK RECONCILE ERROR:', e.message);
    await client.query(
      `UPDATE razorpay_webhook_events
       SET status = 'failed', last_error = $2
       WHERE event_id = $1`,
      [eventId, String(e?.message || 'Webhook processing failed').slice(0, 1000)]
    ).catch(updateError => console.error('Could not persist webhook failure:', updateError.message));
    // Non-2xx tells Razorpay to retry. Reconciliation is idempotent and the
    // persisted event row keeps a trace of attempts and failures.
    return res.status(500).json({ message: 'Webhook processing failed; retry requested.' });
  } finally {
    if (lockAcquired) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [eventId]).catch(() => {});
    client.release();
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
    let giftCardEmailToSend = null;
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
        giftCardEmailToSend = card;
        console.log(`Webhook reconciled gift card ${card.code} (browser never confirmed).`);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    if (giftCardEmailToSend) {
      const { subject, html } = giftCardEmail(giftCardEmailToSend);
      await sendEmail({ to: giftCardEmailToSend.recipient_email, subject, html }).catch(e => console.error('Gift card email failed:', e.message));
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
