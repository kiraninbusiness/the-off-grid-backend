import { Router } from 'express';
import Razorpay from 'razorpay';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { logAdminAction } from '../services/auditLog.js';

const router = Router();
router.use(auth, admin);

// GET /api/admin/customers — list customers with order/spend/loyalty stats
router.get('/customers', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      u.id, u.name, u.email, u.role, u.created_at,
      u.loyalty_points, u.referral_code,
      COUNT(o.id)::int AS order_count,
      COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total ELSE 0 END), 0)::int AS total_spent,
      (SELECT COUNT(*)::int FROM users r WHERE r.referred_by = u.id) AS referral_count
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.role <> 'admin'
    GROUP BY u.id
    ORDER BY total_spent DESC
  `);
  res.json(rows);
});

// GET /api/admin/customers/:id — single customer detail (orders + addresses)
router.get('/customers/:id', async (req, res) => {
  const userResult = await pool.query(
    'SELECT id, name, email, role, created_at, loyalty_points, referral_code FROM users WHERE id = $1',
    [req.params.id]
  );
  if (!userResult.rows.length) return res.status(404).json({ message: 'Customer not found' });

  const [orders, addresses] = await Promise.all([
    pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.params.id]),
    pool.query('SELECT * FROM customer_addresses WHERE user_id = $1 ORDER BY is_default DESC', [req.params.id])
  ]);

  res.json({ ...userResult.rows[0], orders: orders.rows, addresses: addresses.rows });
});

// GET /api/admin/reviews — all reviews (including hidden) for moderation
router.get('/reviews', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.*, u.name AS user_name, p.name AS product_name,
      COALESCE((SELECT json_agg(json_build_object('id', ph.id, 'url', ph.url, 'status', ph.status) ORDER BY ph.id)
                FROM review_photos ph WHERE ph.review_id = r.id), '[]'::json) AS photos
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC
  `);
  res.json(rows);
});

// PATCH /api/admin/reviews/:id — hide/unhide a review
router.patch('/reviews/:id', async (req, res) => {
  const { hidden } = req.body;
  const { rows } = await pool.query(
    'UPDATE reviews SET hidden = $1 WHERE id = $2 RETURNING *',
    [Boolean(hidden), req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Review not found' });
  logAdminAction(req, { action: hidden ? 'review_hidden' : 'review_unhidden', entity: 'review', entityId: req.params.id });
  res.json(rows[0]);
});

// PATCH /api/admin/review-photos/:id — approve or reject a customer photo
router.patch('/review-photos/:id', async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'status must be approved or rejected' });
  const { rows } = await pool.query('UPDATE review_photos SET status = $1 WHERE id = $2 RETURNING id, review_id, url, status', [status, req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Photo not found' });
  logAdminAction(req, { action: `review_photo_${status}`, entity: 'review_photo', entityId: req.params.id });
  res.json(rows[0]);
});

// DELETE /api/admin/reviews/:id — remove a review entirely
router.delete('/reviews/:id', async (req, res) => {
  const before = await pool.query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
  const { rows } = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Review not found' });
  logAdminAction(req, { action: 'review_deleted', entity: 'review', entityId: req.params.id, oldValue: before.rows[0] || null });
  res.json({ success: true });
});

// GET /api/admin/stock-alerts — waitlists per product, for restock planning
router.get('/stock-alerts', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      p.id AS product_id, p.name AS product_name, p.stock,
      COUNT(sa.id)::int AS waiting_count,
      COUNT(sa.id) FILTER (WHERE sa.notified)::int AS notified_count
    FROM stock_alerts sa
    JOIN products p ON p.id = sa.product_id
    GROUP BY p.id, p.name, p.stock
    ORDER BY waiting_count DESC
  `);
  res.json(rows);
});

// GET /api/admin/analytics — revenue/order/product/customer KPIs
router.get('/analytics', async (req, res) => {
  const revenueByPeriod = await pool.query(`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE created_at >= CURRENT_DATE AND status <> 'cancelled'), 0)::int AS today,
      COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('week', NOW()) AND status <> 'cancelled'), 0)::int AS this_week,
      COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('month', NOW()) AND status <> 'cancelled'), 0)::int AS this_month,
      COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('year', NOW()) AND status <> 'cancelled'), 0)::int AS this_year,
      COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS order_count,
      COALESCE(AVG(total) FILTER (WHERE status <> 'cancelled'), 0)::int AS aov,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      COUNT(*)::int AS total_orders
    FROM orders
  `);

  const bestProducts = await pool.query(`
    SELECT p.id, p.name, SUM(oi.quantity)::int AS units_sold, SUM(oi.quantity * oi.price)::int AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
    JOIN products p ON p.id = oi.product_id
    GROUP BY p.id, p.name
    ORDER BY units_sold DESC
    LIMIT 5
  `);

  const bestSizes = await pool.query(`
    SELECT selected_size AS size, SUM(quantity)::int AS units_sold
    FROM order_items oi JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
    WHERE selected_size IS NOT NULL AND selected_size <> ''
    GROUP BY selected_size ORDER BY units_sold DESC LIMIT 5
  `);

  const bestColors = await pool.query(`
    SELECT selected_color AS color, SUM(quantity)::int AS units_sold
    FROM order_items oi JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
    WHERE selected_color IS NOT NULL AND selected_color <> ''
    GROUP BY selected_color ORDER BY units_sold DESC LIMIT 5
  `);

  const lowStock = await pool.query(`SELECT id, name, stock FROM products WHERE stock <= 5 ORDER BY stock ASC LIMIT 10`);

  const customerStats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS new_this_month,
      COUNT(*)::int AS total_customers
    FROM users WHERE role <> 'admin'
  `);

  const repeatCustomers = await pool.query(`
    SELECT COUNT(*)::int AS repeat_count FROM (
      SELECT user_id FROM orders WHERE status <> 'cancelled' GROUP BY user_id HAVING COUNT(*) > 1
    ) t
  `);

  res.json({
    revenue: revenueByPeriod.rows[0],
    best_products: bestProducts.rows,
    best_sizes: bestSizes.rows,
    best_colors: bestColors.rows,
    low_stock: lowStock.rows,
    customers: { ...customerStats.rows[0], repeat_customers: repeatCustomers.rows[0].repeat_count }
  });
});

// GET /api/admin/audit-log — recent admin actions
router.get('/audit-log', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 200`
  );
  res.json(rows);
});

// Captured payment on an already-cancelled order: controlled full-refund workflow.
router.get('/payment-exceptions', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, user_id, total, payment_method, payment_status,
            razorpay_payment_id, payment_reconciliation_status,
            razorpay_refund_id, refund_settled_at, created_at
     FROM orders
     WHERE payment_reconciliation_status IS NOT NULL
     ORDER BY created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.post('/orders/:id/refund-exception', async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Razorpay is not configured' });
  }
  const client = await pool.connect();
  let order;
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    order = result.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Order not found' }); }
    if (order.status !== 'cancelled' || order.payment_status !== 'paid' ||
        order.payment_reconciliation_status !== 'refund_required' || !order.razorpay_payment_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order is not awaiting a Razorpay refund' });
    }
    // Persist intent before calling Razorpay. A process crash after the API call
    // must be reconciled in the Razorpay dashboard, never blindly retried.
    await client.query(
      `UPDATE orders SET payment_reconciliation_status = 'refund_initiating' WHERE id = $1`,
      [order.id]
    );
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Could not reserve payment exception refund:', e.message);
    return res.status(500).json({ message: 'Could not prepare refund' });
  } finally {
    client.release();
  }

  try {
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    const refund = await rzp.payments.refund(order.razorpay_payment_id, {
      amount: Math.round(Number(order.total) * 100),
      speed: 'optimum',
      notes: { order_id: String(order.id), purpose: 'cancelled_order_late_capture' }
    });
    const { rows } = await pool.query(
      `UPDATE orders
       SET payment_status = 'refunded', razorpay_refund_id = $1,
           payment_reconciliation_status = 'refund_issued'
       WHERE id = $2 AND payment_reconciliation_status = 'refund_initiating'
       RETURNING id, payment_status, payment_reconciliation_status, razorpay_refund_id`,
      [refund.id, order.id]
    );
    if (!rows.length) return res.status(409).json({ message: 'Refund was created but order state needs manual reconciliation', refund_id: refund.id });
    logAdminAction(req, {
      action: 'late_capture_refund_issued', entity: 'order', entityId: order.id,
      newValue: { refund_id: refund.id, amount: Number(order.total) }
    });
    return res.json(rows[0]);
  } catch (e) {
    // Leave refund_initiating on an ambiguous provider/network outcome to prevent
    // a duplicate refund. The admin must reconcile the payment in Razorpay.
    console.error('Late capture refund requires reconciliation:', e.message);
    return res.status(502).json({ message: 'Refund outcome is uncertain. Check Razorpay before taking another action; this request has not been automatically retried.' });
  }
});

// Creator programme moderation — applications only; commission/payout controls are not enabled.
router.get('/creators', async (req, res) => {
  const status = String(req.query.status || '').trim();
  const allowed = new Set(['pending', 'approved', 'rejected', 'paused']);
  if (status && !allowed.has(status)) return res.status(400).json({ message: 'Invalid creator status' });
  const values = [];
  const where = status ? (values.push(status), 'WHERE ca.status = $1') : '';
  const { rows } = await pool.query(
    `SELECT ca.*, u.name AS user_name, u.email AS user_email
     FROM creator_applications ca JOIN users u ON u.id = ca.user_id
     ${where}
     ORDER BY CASE WHEN ca.status = 'pending' THEN 0 ELSE 1 END, ca.created_at DESC
     LIMIT 200`,
    values
  );
  res.json(rows);
});

router.patch('/creators/:id', async (req, res) => {
  const status = String(req.body?.status || '');
  const note = typeof req.body?.admin_note === 'string' ? req.body.admin_note.trim().slice(0, 500) : null;
  if (!['approved', 'rejected', 'paused'].includes(status)) {
    return res.status(400).json({ message: 'Choose approved, rejected or paused' });
  }
  const before = await pool.query('SELECT * FROM creator_applications WHERE id = $1', [req.params.id]);
  if (!before.rows.length) return res.status(404).json({ message: 'Creator application not found' });
  const { rows } = await pool.query(
    `UPDATE creator_applications
     SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, note, req.user.id, req.params.id]
  );
  logAdminAction(req, {
    action: 'creator_application_' + status,
    entity: 'creator_application',
    entityId: req.params.id,
    oldValue: { status: before.rows[0].status },
    newValue: { status, admin_note: note }
  });
  res.json(rows[0]);
});

export default router;
