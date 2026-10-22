import { Router } from 'express';
import Razorpay from 'razorpay';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { sendEmail, returnStatusEmail } from '../services/email.js';
import { logStockMovement, notifyRestock } from './variants.js';
import { createNotification } from '../services/notifications.js';
import { logAdminAction } from '../services/auditLog.js';

const router = Router();

const RETURN_WINDOW_DAYS = 10;

// Order items relevant to a return: the single referenced line item,
// or — for older requests made before order_item_id was required —
// every item on the order.
async function relevantOrderItems(client, ret) {
  if (ret.order_item_id) {
    const { rows } = await client.query('SELECT * FROM order_items WHERE id = $1', [ret.order_item_id]);
    return rows;
  }
  const { rows } = await client.query('SELECT * FROM order_items WHERE order_id = $1', [ret.order_id]);
  return rows;
}

// POST /api/returns — customer requests a return or exchange
router.post('/', auth, async (req, res) => {
  const {
    order_id,
    order_item_id = null,
    type = 'return',
    reason = '',
    exchange_size = null,
    exchange_color = null
  } = req.body;

  if (!['return', 'exchange'].includes(type)) {
    return res.status(400).json({ message: 'Invalid request type' });
  }
  if (!reason.trim()) {
    return res.status(400).json({ message: 'Please tell us the reason for this request' });
  }

  try {
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, req.user.id]
    );
    const order = orderResult.rows[0];

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders are eligible for return or exchange' });
    }

    if (order.delivered_at) {
      const deadline = new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() > deadline) {
        return res.status(400).json({ message: `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed` });
      }
    }

    const existing = await pool.query(
      `SELECT id FROM returns WHERE order_id = $1 AND user_id = $2
       AND (order_item_id = $3 OR ($3::int IS NULL AND order_item_id IS NULL))
       AND status NOT IN ('rejected')`,
      [order_id, req.user.id, order_item_id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ message: 'A request already exists for this item' });
    }

    const { rows } = await pool.query(
      `INSERT INTO returns (order_id, order_item_id, user_id, type, reason, exchange_size, exchange_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [order_id, order_item_id, req.user.id, type, reason.trim().slice(0, 500), exchange_size, exchange_color]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /returns failed:', e.message);
    res.status(500).json({ message: 'Could not submit request' });
  }
});

// GET /api/returns/mine — customer's own requests
router.get('/mine', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM returns WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/returns — admin: all requests
router.get('/', auth, admin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.name AS customer_name, u.email AS customer_email,
            o.payment_method, o.payment_status, o.total AS order_total
     FROM returns r
     JOIN users u ON u.id = r.user_id
     JOIN orders o ON o.id = r.order_id
     ORDER BY r.created_at DESC`
  );
  res.json(rows);
});

// PATCH /api/returns/:id — admin: update status
// RECEIVED automatically restocks the returned SKU. EXCHANGED
// automatically reserves/deducts the replacement SKU (and refuses if
// the requested size/color isn't in stock, rather than silently
// marking an exchange "done" with nothing to actually ship).
router.patch('/:id', auth, admin, async (req, res) => {
  const allowedStatuses = ['requested', 'approved', 'rejected', 'received', 'refunded', 'exchanged'];
  const { status, admin_notes, refund_amount } = req.body;

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT r.*, o.payment_method, o.payment_status
       FROM returns r JOIN orders o ON o.id = r.order_id
       WHERE r.id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const current = existingResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Request not found' });
    }

    // An online order's refund has to actually move money through
    // Razorpay — that can't happen via a plain status-label update.
    // COD orders have nothing for Razorpay to refund (the customer
    // never paid online), so a manual "mark refunded" label is
    // legitimate there once the admin has refunded them directly.
    if (status === 'refunded' && current.payment_method === 'online' && current.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'This was an online payment — use "Issue Refund" to refund it through Razorpay instead of setting the status directly.'
      });
    }

    // RECEIVED — automatically restock whatever came back.
    if (status === 'received' && current.status !== 'received') {
      const items = await relevantOrderItems(client, current);
      for (const item of items) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        let variantId = null;
        if (item.selected_size) {
          const v = await client.query(
            `UPDATE product_variants SET stock = stock + $1
             WHERE product_id = $2 AND size = $3 AND color = $4 RETURNING id`,
            [item.quantity, item.product_id, item.selected_size, item.selected_color || '']
          );
          variantId = v.rows[0]?.id || null;
        }
        await logStockMovement(client, {
          productId: item.product_id, variantId, change: item.quantity,
          reason: 'return_received', reference: `return #${current.id}`
        });
        notifyRestock(item.product_id).catch((e) => console.error('restock notify failed:', e.message));
      }
    }

    // EXCHANGED — reserve and deduct the replacement SKU. Refuses the
    // status change outright if it isn't actually in stock, so admin
    // can't accidentally mark an exchange "done" with nothing to ship.
    if (status === 'exchanged' && current.type === 'exchange' && current.status !== 'exchanged') {
      const items = await relevantOrderItems(client, current);
      const original = items[0];
      if (!original) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Could not find the original item to exchange' });
      }

      const targetSize = current.exchange_size || original.selected_size;
      const targetColor = current.exchange_color || original.selected_color || '';

      const variantResult = await client.query(
        `SELECT * FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3 FOR UPDATE`,
        [original.product_id, targetSize, targetColor]
      );
      const variant = variantResult.rows[0];

      if (variant) {
        if (Number(variant.stock) < Number(original.quantity)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `${targetSize}${targetColor ? ' / ' + targetColor : ''} doesn't have enough stock for this exchange` });
        }
        await client.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [original.quantity, variant.id]);
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [original.quantity, original.product_id]);
        await logStockMovement(client, {
          productId: original.product_id, variantId: variant.id, change: -original.quantity,
          reason: 'exchange_fulfilled', reference: `return #${current.id}`
        });
      }
      // No variants set up for this product at all: nothing to
      // reserve against, so we let the exchange proceed on trust
      // (matches how this product's stock is tracked everywhere else
      // — product-level only, no SKU breakdown to check).

      /*
        SEPARATE REPLACEMENT ORDER
        Gives the replacement its own order id/invoice rather than
        living only inside the return record — matters once exchange
        volume is high enough that you need independent fulfillment
        and invoicing for replacements. total is informational (the
        customer already paid via the original order; this isn't a
        new charge).
      */
      const originalOrder = await client.query('SELECT * FROM orders WHERE id = $1', [current.order_id]);
      const src = originalOrder.rows[0];
      const replacementOrder = await client.query(
        `INSERT INTO orders (
          user_id, total, shipping_name, shipping_phone, shipping_address, shipping_email,
          shipping_city, shipping_state, shipping_pincode, payment_method, payment_status,
          status, order_type, replacement_for_return_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'exchange','paid','processing','exchange_replacement',$10)
        RETURNING *`,
        [
          current.user_id, original.price * original.quantity,
          src.shipping_name, src.shipping_phone, src.shipping_address, src.shipping_email,
          src.shipping_city, src.shipping_state, src.shipping_pincode, current.id
        ]
      );
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, price, quantity, selected_size, selected_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [replacementOrder.rows[0].id, original.product_id, original.name, original.price, original.quantity, targetSize, targetColor]
      );
      await client.query('UPDATE returns SET replacement_order_id = $1 WHERE id = $2', [replacementOrder.rows[0].id, current.id]);
    }

    const sets = ['updated_at = NOW()'];
    const values = [];
    if (status) { values.push(status); sets.push(`status = $${values.length}`); }
    if (admin_notes !== undefined) { values.push(admin_notes); sets.push(`admin_notes = $${values.length}`); }
    if (refund_amount !== undefined) { values.push(refund_amount); sets.push(`refund_amount = $${values.length}`); }
    if (status === 'exchanged' && current.type === 'exchange' && current.status !== 'exchanged') {
      sets.push(`replacement_status = 'reserved'`);
    }

    values.push(req.params.id);

    const { rows } = await client.query(
      `UPDATE returns SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    await client.query('COMMIT');

    const customer = await pool.query('SELECT email FROM users WHERE id = $1', [rows[0].user_id]);
    if (customer.rows[0]?.email) {
      const { subject, html } = returnStatusEmail(rows[0]);
      sendEmail({ to: customer.rows[0].email, subject, html }).catch(() => {});
    }
    createNotification(rows[0].user_id, {
      type: 'return_status',
      title: `${rows[0].type === 'exchange' ? 'Exchange' : 'Return'} ${rows[0].status}`,
      link: '/account?tab=returns'
    });

    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PATCH /returns/:id failed:', e.message);
    res.status(500).json({ message: 'Could not update request' });
  } finally {
    client.release();
  }
});

/*
  POST /api/returns/:id/refund — admin: issue a REAL Razorpay refund
  ------------------------------------------------------------------
  Previously, an admin marking a return "REFUNDED" only updated a
  database label — no money ever actually moved. This calls Razorpay's
  Refund API against the order's real payment, and only marks the
  return as refunded once Razorpay confirms the refund was created.
  Full or partial refunds are supported via refund_amount.
  ------------------------------------------------------------------
*/
router.post('/:id/refund', auth, admin, async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Razorpay is not configured' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT r.*, o.razorpay_payment_id, o.payment_method, o.payment_status, o.total
       FROM returns r JOIN orders o ON o.id = r.order_id
       WHERE r.id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const ret = rows[0];

    if (!ret) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Request not found' }); }
    if (ret.status === 'refunded') { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Already refunded' }); }
    if (ret.payment_method !== 'online' || ret.payment_status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This order was not paid online through Razorpay' });
    }
    if (!ret.razorpay_payment_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No Razorpay payment ID on file for this order — cannot issue an automatic refund' });
    }

    const amount = req.body.refund_amount != null ? Number(req.body.refund_amount) : Number(ret.total);
    if (!(amount > 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Refund amount must be greater than zero' });
    }

    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const refund = await rzp.payments.refund(ret.razorpay_payment_id, {
      amount: Math.round(amount * 100),
      speed: 'optimum',
      notes: { return_id: String(ret.id), order_id: String(ret.order_id) }
    });

    const updated = await client.query(
      `UPDATE returns
       SET status = 'refunded', refund_amount = $1, razorpay_refund_id = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [amount, refund.id, ret.id]
    );

    await client.query('COMMIT');

    logAdminAction(req, {
      action: 'refund_issued', entity: 'return', entityId: ret.id,
      newValue: { amount, razorpay_refund_id: refund.id }
    });

    const customer = await pool.query('SELECT email FROM users WHERE id = $1', [ret.user_id]);
    if (customer.rows[0]?.email) {
      const { subject, html } = returnStatusEmail(updated.rows[0]);
      sendEmail({ to: customer.rows[0].email, subject, html }).catch(() => {});
    }
    createNotification(ret.user_id, {
      type: 'return_status',
      title: `Refund of ₹${amount} processed for return #${ret.id}`,
      link: '/account?tab=returns'
    });

    res.json(updated.rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('REFUND ERROR:', e.message);
    res.status(500).json({ message: e.error?.description || 'Could not process refund through Razorpay' });
  } finally {
    client.release();
  }
});

/*
  PATCH /api/returns/:id/shipment — admin: track the replacement item's
  shipment for an exchange. Separate from the main status PATCH above,
  same pattern as how order status vs order shipment info are kept
  distinct — this only makes sense once the exchange is 'reserved'.
*/
router.patch('/:id/shipment', auth, admin, async (req, res) => {
  const { courier, awb, tracking_url, mark } = req.body; // mark: 'shipped' | 'delivered'

  if (mark && !['shipped', 'delivered'].includes(mark)) {
    return res.status(400).json({ message: 'Invalid shipment status' });
  }

  const existing = await pool.query('SELECT * FROM returns WHERE id = $1', [req.params.id]);
  const current = existing.rows[0];
  if (!current) return res.status(404).json({ message: 'Request not found' });
  if (current.type !== 'exchange' || !current.replacement_status) {
    return res.status(400).json({ message: 'This request has no replacement item reserved yet' });
  }

  const sets = [];
  const values = [];
  if (courier !== undefined) { values.push(courier); sets.push(`replacement_courier = $${values.length}`); }
  if (awb !== undefined) { values.push(awb); sets.push(`replacement_awb = $${values.length}`); }
  if (tracking_url !== undefined) { values.push(tracking_url); sets.push(`replacement_tracking_url = $${values.length}`); }
  if (mark === 'shipped') { sets.push(`replacement_status = 'shipped'`, `replacement_shipped_at = NOW()`); }
  if (mark === 'delivered') { sets.push(`replacement_status = 'delivered'`, `replacement_delivered_at = NOW()`); }

  if (!sets.length) return res.status(400).json({ message: 'Nothing to update' });

  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE returns SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  const updated = rows[0];

  // Keep the replacement's own order record in sync with the shipment mark
  if (mark && updated.replacement_order_id) {
    const orderStatus = mark === 'shipped' ? 'shipped' : 'delivered';
    await pool.query(
      `UPDATE orders SET status = $1${mark === 'delivered' ? ", delivered_at = NOW()" : ""} WHERE id = $2`,
      [orderStatus, updated.replacement_order_id]
    );
  }

  if (mark) {
    const customer = await pool.query('SELECT email FROM users WHERE id = $1', [updated.user_id]);
    if (customer.rows[0]?.email) {
      const subject = mark === 'shipped'
        ? `Your replacement item has shipped — return #${updated.id}`
        : `Your replacement item was delivered — return #${updated.id}`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <div style="background:#111;color:#fff;padding:20px 24px;letter-spacing:1px"><strong>THE OFF GRID</strong></div>
          <div style="padding:24px;border:1px solid #eee;border-top:none">
            <h2 style="margin-top:0">${mark === 'shipped' ? 'Your replacement is on its way' : 'Replacement delivered'}</h2>
            ${updated.replacement_courier ? `<p>Courier: ${updated.replacement_courier}</p>` : ''}
            ${updated.replacement_awb ? `<p>AWB: ${updated.replacement_awb}</p>` : ''}
            ${updated.replacement_tracking_url ? `<p><a href="${updated.replacement_tracking_url}">Track your shipment</a></p>` : ''}
          </div>
        </div>
      `;
      sendEmail({ to: customer.rows[0].email, subject, html }).catch(() => {});
    }
    createNotification(updated.user_id, {
      type: 'return_status',
      title: mark === 'shipped' ? `Replacement item shipped — return #${updated.id}` : `Replacement item delivered — return #${updated.id}`,
      link: '/account?tab=returns'
    });
  }

  res.json(updated);
});

export default router;
