import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

/*
  SERVER-SIDE CART & WISHLIST

  The storefront still keeps a fast local (localStorage) copy for
  instant UI updates, but for a logged-in user it now also syncs to
  these tables — so a cart started on mobile shows up on desktop.
  Guests (not logged in) still just use localStorage, same as before;
  merging happens once on login (frontend calls PUT /cart/merge with
  the local cart it was holding as a guest).
*/

async function cartWithProducts(userId) {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.product_id, ci.quantity, ci.selected_size, ci.selected_color, ci.updated_at,
            p.name, p.price, p.image, p.stock, p.category
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1
     ORDER BY ci.updated_at DESC`,
    [userId]
  );
  return rows;
}

// GET /api/cart — this user's server-side cart
router.get('/', async (req, res) => {
  res.json(await cartWithProducts(req.user.id));
});

// PUT /api/cart/item — add or update quantity for one product/size/color
router.put('/item', async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  // Normalize to '' rather than null/undefined — Postgres treats NULL
  // as distinct from NULL in the unique constraint below, so a NULL
  // here would silently defeat ON CONFLICT and insert a duplicate row
  // every time instead of updating the existing one.
  const selected_size = req.body.selected_size || '';
  const selected_color = req.body.selected_color || '';
  if (!product_id || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
    return res.status(400).json({ message: 'Invalid cart item' });
  }

  const { rows } = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity, selected_size, selected_color, updated_at, abandoned_email_sent)
     VALUES ($1,$2,$3,$4,$5,NOW(),FALSE)
     ON CONFLICT (user_id, product_id, selected_size, selected_color)
     DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW(), abandoned_email_sent = FALSE
     RETURNING *`,
    [req.user.id, product_id, Number(quantity), selected_size, selected_color]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/cart/item/:id — remove one line item
router.delete('/item/:id', async (req, res) => {
  const result = await pool.query(
    'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Cart item not found' });
  res.status(204).end();
});

// DELETE /api/cart — clear the whole cart (after checkout)
router.delete('/', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
  res.status(204).end();
});

// POST /api/cart/merge — merge a guest's localStorage cart in on login/register
router.post('/merge', async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];

  for (const item of items) {
    if (!item.id) continue;
    await pool.query(
      `INSERT INTO cart_items (user_id, product_id, quantity, selected_size, selected_color, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id, product_id, selected_size, selected_color)
       DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 20), updated_at = NOW()`,
      [req.user.id, item.id, Math.max(1, Number(item.qty) || 1), item.selectedSize || '', item.selectedColor || '']
    );
  }

  res.json(await cartWithProducts(req.user.id));
});

// --- WISHLIST ---

// GET /api/cart/wishlist
router.get('/wishlist', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows.map((r) => r.product_id));
});

// PUT /api/cart/wishlist/:productId — add
router.put('/wishlist/:productId', async (req, res) => {
  const product = await pool.query('SELECT price FROM products WHERE id = $1', [req.params.productId]);
  await pool.query(
    `INSERT INTO wishlist_items (user_id, product_id, last_known_price) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [req.user.id, req.params.productId, product.rows[0]?.price ?? null]
  );
  res.status(201).json({ success: true });
});

// DELETE /api/cart/wishlist/:productId — remove
router.delete('/wishlist/:productId', async (req, res) => {
  await pool.query(
    'DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2',
    [req.user.id, req.params.productId]
  );
  res.status(204).end();
});

// POST /api/cart/wishlist/merge — merge guest wishlist on login
router.post('/wishlist/merge', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  for (const id of ids) {
    const product = await pool.query('SELECT price FROM products WHERE id = $1', [id]);
    await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id, last_known_price) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.id, id, product.rows[0]?.price ?? null]
    );
  }
  const { rows } = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1', [req.user.id]);
  res.json(rows.map((r) => r.product_id));
});

export default router;
