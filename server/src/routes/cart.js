import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);
const MAX_CART_QUANTITY = 10;

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

router.get('/', async (req, res) => {
  res.json(await cartWithProducts(req.user.id));
});

// mode=increment is used only by Add to Bag; the default mode sets an exact quantity.
router.put('/item', async (req, res) => {
  const productId = Number(req.body?.product_id);
  const quantity = Number(req.body?.quantity ?? 1);
  const mode = req.body?.mode === 'increment' ? 'increment' : 'set';
  const selected_size = String(req.body?.selected_size || '').trim();
  const selected_color = String(req.body?.selected_color || '').trim();

  if (!Number.isSafeInteger(productId) || productId < 1 ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY ||
      selected_size.length > 80 || selected_color.length > 80) {
    return res.status(400).json({ message: `Choose a valid product and quantity between 1 and ${MAX_CART_QUANTITY}.` });
  }
  const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
  if (!product.rows.length) return res.status(404).json({ message: 'Product not found.' });

  const { rows } = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity, selected_size, selected_color, updated_at, abandoned_email_sent)
     VALUES ($1,$2,$3,$4,$5,NOW(),FALSE)
     ON CONFLICT (user_id, product_id, selected_size, selected_color)
     DO UPDATE SET
       quantity = CASE WHEN $6 = 'increment'
         THEN LEAST(cart_items.quantity + EXCLUDED.quantity, $7)
         ELSE EXCLUDED.quantity
       END,
       updated_at = NOW(), abandoned_email_sent = FALSE
     RETURNING *`,
    [req.user.id, productId, quantity, selected_size, selected_color, mode, MAX_CART_QUANTITY]
  );
  res.status(200).json(rows[0]);
});

router.delete('/item/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid cart item.' });
  const result = await pool.query(
    'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ message: 'Cart item not found' });
  res.status(204).end();
});

router.delete('/', async (req, res) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
  res.status(204).end();
});

// Guest-cart merge is atomic and idempotent. A retry with the same request_id never adds quantities twice.
router.post('/merge', async (req, res) => {
  if (!Array.isArray(req.body?.items)) return res.status(400).json({ message: 'Cart items must be provided as a list.' });
  const requestId = String(req.body?.request_id || '').trim();
  if (!requestId || requestId.length > 128) return res.status(400).json({ message: 'A valid cart migration request ID is required.' });

  const combined = new Map();
  for (const raw of req.body.items) {
    const id = Number(raw?.id);
    const qty = Number(raw?.qty);
    const selectedSize = String(raw?.selectedSize || '').trim();
    const selectedColor = String(raw?.selectedColor || '').trim();
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > MAX_CART_QUANTITY ||
        selectedSize.length > 80 || selectedColor.length > 80) {
      return res.status(400).json({ message: 'The guest bag contains an invalid product, variant, or quantity.' });
    }
    const key = JSON.stringify([id, selectedSize, selectedColor]);
    const prior = combined.get(key);
    combined.set(key, { id, qty: Math.min(MAX_CART_QUANTITY, (prior?.qty || 0) + qty), selectedSize, selectedColor });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const marker = await client.query(
      `INSERT INTO cart_merge_requests (user_id, request_id)
       VALUES ($1,$2) ON CONFLICT (user_id, request_id) DO NOTHING RETURNING request_id`,
      [req.user.id, requestId]
    );
    if (!marker.rows.length) {
      await client.query('COMMIT');
      return res.json(await cartWithProducts(req.user.id));
    }

    const ids = [...new Set([...combined.values()].map(x => x.id))];
    if (ids.length) {
      const found = await client.query('SELECT id FROM products WHERE id = ANY($1::int[])', [ids]);
      if (found.rows.length !== ids.length) {
        const err = new Error('One or more products in the guest bag no longer exist.');
        err.status = 400;
        throw err;
      }
    }

    for (const item of combined.values()) {
      await client.query(
        `INSERT INTO cart_items (user_id, product_id, quantity, selected_size, selected_color, updated_at, abandoned_email_sent)
         VALUES ($1,$2,$3,$4,$5,NOW(),FALSE)
         ON CONFLICT (user_id, product_id, selected_size, selected_color)
         DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, $6),
                       updated_at = NOW(), abandoned_email_sent = FALSE`,
        [req.user.id, item.id, item.qty, item.selectedSize, item.selectedColor, MAX_CART_QUANTITY]
      );
    }
    await client.query('COMMIT');
    res.json(await cartWithProducts(req.user.id));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.status === 400) return res.status(400).json({ message: e.message });
    throw e;
  } finally {
    client.release();
  }
});

// --- WISHLIST ---
router.get('/wishlist', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows.map((r) => r.product_id));
});

router.put('/wishlist/:productId', async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ message: 'Invalid product.' });
  const product = await pool.query('SELECT price FROM products WHERE id = $1', [productId]);
  if (!product.rows.length) return res.status(404).json({ message: 'Product not found.' });
  await pool.query(
    `INSERT INTO wishlist_items (user_id, product_id, last_known_price) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [req.user.id, productId, product.rows[0].price]
  );
  res.status(201).json({ success: true });
});

router.delete('/wishlist/:productId', async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isSafeInteger(productId) || productId < 1) return res.status(400).json({ message: 'Invalid product.' });
  await pool.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
  res.status(204).end();
});

router.post('/wishlist/merge', async (req, res) => {
  if (!Array.isArray(req.body?.ids)) return res.status(400).json({ message: 'Wishlist IDs must be a list.' });
  const ids = [...new Set(req.body.ids.map(Number))];
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1)) return res.status(400).json({ message: 'Invalid wishlist product.' });
  for (const id of ids) {
    const product = await pool.query('SELECT price FROM products WHERE id = $1', [id]);
    if (!product.rows.length) continue;
    await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id, last_known_price) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.id, id, product.rows[0].price]
    );
  }
  const { rows } = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1', [req.user.id]);
  res.json(rows.map((r) => r.product_id));
});

export default router;
