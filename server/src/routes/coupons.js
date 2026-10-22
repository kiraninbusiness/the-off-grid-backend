import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';

const router = Router();

/*
  Shared validation logic.
  Returns { ok, discount, message, coupon } given a code + subtotal.
  Does NOT mutate the database — callers that need to consume a
  coupon (order creation) do that themselves inside a transaction.
*/
async function checkCoupon(queryable, rawCode, subtotal, userId = null) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, message: 'Enter a coupon code' };

  const { rows } = await queryable.query(
    'SELECT * FROM coupons WHERE code=$1',
    [code]
  );
  const coupon = rows[0];

  if (!coupon) return { ok: false, message: 'Invalid coupon code' };
  if (!coupon.active) return { ok: false, message: 'This coupon is no longer active' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { ok: false, message: 'This coupon has expired' };
  }
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
    return { ok: false, message: 'This coupon has reached its usage limit' };
  }
  if (userId) {
    const perUser = await queryable.query(
      'SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
      [coupon.id, userId]
    );
    if (perUser.rows[0].count >= (coupon.max_uses_per_user || 1)) {
      return { ok: false, message: "You've already used this coupon" };
    }
  }
  if (subtotal < coupon.min_order) {
    return {
      ok: false,
      message: `Add ₹${coupon.min_order - subtotal} more to use this coupon`
    };
  }

  let discount =
    coupon.type === 'flat'
      ? coupon.value
      : Math.round((subtotal * coupon.value) / 100);

  if (coupon.max_discount != null) {
    discount = Math.min(discount, coupon.max_discount);
  }
  discount = Math.max(0, Math.min(discount, subtotal));

  return { ok: true, discount, coupon };
}

/*
  CUSTOMER — VALIDATE A COUPON AT CHECKOUT
  Does not require login (guest carts can preview a discount),
  but the actual redemption is re-verified on order creation.
*/
router.post('/validate', async (req, res) => {
  const { code, subtotal = 0 } = req.body;
  const result = await checkCoupon(pool, code, Number(subtotal) || 0);
  if (!result.ok) return res.status(400).json({ message: result.message });
  res.json({
    code: result.coupon.code,
    type: result.coupon.type,
    value: result.coupon.value,
    discount: result.discount
  });
});

/*
  ADMIN — LIST ALL COUPONS
*/
router.get('/', auth, admin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM coupons ORDER BY created_at DESC'
  );
  res.json(rows);
});

/*
  ADMIN — CREATE A COUPON
*/
router.post('/', auth, admin, async (req, res) => {
  const {
    code,
    type = 'percent',
    value,
    min_order = 0,
    max_discount = null,
    usage_limit = null,
    expires_at = null
  } = req.body;

  if (!code || !value) {
    return res.status(400).json({ message: 'Code and value are required' });
  }
  if (!['percent', 'flat'].includes(type)) {
    return res.status(400).json({ message: 'Type must be percent or flat' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO coupons(code, type, value, min_order, max_discount, usage_limit, expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        type,
        value,
        min_order,
        max_discount,
        usage_limit,
        expires_at
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ message: 'A coupon with this code already exists' });
    }
    console.error('COUPON CREATE ERROR:', e.message);
    res.status(400).json({ message: 'Could not create coupon' });
  }
});

/*
  ADMIN — UPDATE A COUPON (e.g. toggle active, change value)
*/
router.patch('/:id', auth, admin, async (req, res) => {
  const allowed = [
    'code', 'type', 'value', 'min_order',
    'max_discount', 'usage_limit', 'active', 'expires_at'
  ];
  const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!entries.length) return res.status(400).json({ message: 'Nothing to update' });

  if (entries.some(([k]) => k === 'code')) {
    entries.forEach((e) => {
      if (e[0] === 'code') e[1] = String(e[1]).trim().toUpperCase();
    });
  }

  const vals = entries.map(([, v]) => v);
  vals.push(req.params.id);
  const set = entries.map(([k], i) => `${k}=$${i + 1}`).join(',');

  const { rows } = await pool.query(
    `UPDATE coupons SET ${set} WHERE id=$${vals.length} RETURNING *`,
    vals
  );
  if (!rows.length) return res.status(404).json({ message: 'Coupon not found' });
  res.json(rows[0]);
});

/*
  ADMIN — DELETE A COUPON
*/
router.delete('/:id', auth, admin, async (req, res) => {
  await pool.query('DELETE FROM coupons WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

export { checkCoupon };
export default router;
