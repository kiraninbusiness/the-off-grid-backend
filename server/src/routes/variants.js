import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { sendEmail, backInStockEmail } from '../services/email.js';
import { createNotification } from '../services/notifications.js';

const router = Router();

/*
  SKU-LEVEL VARIANT INVENTORY

  A product can optionally have rows in product_variants (size + color
  combination -> stock). When a product has no variants, order placement
  falls back to the old products.stock behaviour — so this is fully
  backward compatible with the existing 12-product catalogue.
*/

export async function logStockMovement(client, { productId, variantId = null, change, reason, reference = null }) {
  await client.query(
    `INSERT INTO stock_movements (product_id, variant_id, change, reason, reference)
     VALUES ($1,$2,$3,$4,$5)`,
    [productId, variantId, change, reason, reference]
  );
}

// GET /api/products/:id/variants — public
router.get('/:id/variants', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY size, color',
    [req.params.id]
  );
  res.json(rows);
});

// PUT /api/products/:id/variants — admin: replace the full variant set for a product
router.put('/:id/variants', auth, admin, async (req, res) => {
  const productId = req.params.id;
  const variants = Array.isArray(req.body.variants) ? req.body.variants : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const product = await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [productId]);
    if (!product.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Product not found' });
    }

    const before = await client.query('SELECT id, size, color, stock FROM product_variants WHERE product_id = $1', [productId]);
    const beforeByKey = Object.fromEntries(before.rows.map((v) => [`${v.size}::${v.color}`, v]));

    /*
      FIX: this used to DELETE every variant row for the product and
      recreate them all from scratch — including ones that hadn't
      actually changed. Because stock_alerts.variant_id cascades on
      delete, saving the variant grid silently destroyed every
      customer's "notify me" subscription for this product, even when
      the admin only touched one size. It also meant the ON CONFLICT
      clause below could never actually fire (nothing was left to
      conflict with by the time the INSERT ran). Now we only delete
      the specific variants the admin actually removed from the grid,
      and UPSERT the rest in place — unchanged variants keep their
      real row id, and their alerts survive.
    */
    const incomingKeys = new Set(
      variants.map((v) => `${String(v.size || '').trim()}::${String(v.color || '').trim()}`)
    );
    const removedIds = before.rows
      .filter((v) => !incomingKeys.has(`${v.size}::${v.color}`))
      .map((v) => v.id);
    if (removedIds.length) {
      await client.query('DELETE FROM product_variants WHERE id = ANY($1::int[])', [removedIds]);
    }

    const inserted = [];
    const restockedVariantIds = [];
    for (const v of variants) {
      const size = String(v.size || '').trim();
      const color = String(v.color || '').trim();
      const stock = Math.max(0, Number(v.stock) || 0);
      const sku = String(v.sku || '').trim() || null;
      const barcode = String(v.barcode || '').trim() || null;
      const cost_price = v.cost_price != null && v.cost_price !== '' ? Number(v.cost_price) : null;
      if (!size) continue;
      const { rows } = await client.query(
        `INSERT INTO product_variants (product_id, size, color, stock, sku, barcode, cost_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (product_id, size, color) DO UPDATE SET stock = EXCLUDED.stock, sku = EXCLUDED.sku, barcode = EXCLUDED.barcode, cost_price = EXCLUDED.cost_price
         RETURNING *`,
        [productId, size, color, stock, sku, barcode, cost_price]
      );
      inserted.push(rows[0]);

      const prior = beforeByKey[`${size}::${color}`];
      const delta = stock - Number(prior?.stock || 0);
      if (delta !== 0) {
        await logStockMovement(client, { productId, variantId: rows[0].id, change: delta, reason: 'admin_adjustment', reference: 'variant grid save' });
      }
      if (Number(prior?.stock || 0) === 0 && stock > 0) {
        restockedVariantIds.push(rows[0].id);
      }
    }

    // Keep the legacy products.stock column in sync (sum of variant stock)
    // so anywhere that still reads product.stock (cards, filters) stays accurate.
    const total = inserted.reduce((sum, v) => sum + Number(v.stock), 0);
    await client.query('UPDATE products SET stock = $1 WHERE id = $2', [total, productId]);

    await client.query('COMMIT');

    for (const variantId of restockedVariantIds) {
      notifyRestock(productId, variantId).catch((e) => console.error('restock notify failed:', e.message));
    }

    res.json(inserted);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') {
      return res.status(409).json({ message: 'That SKU is already used by another variant' });
    }
    console.error('PUT variants failed:', e.message);
    res.status(400).json({ message: 'Could not save variants' });
  } finally {
    client.release();
  }
});

// PATCH /api/products/:id/variants/:variantId — admin: update stock for one SKU (e.g. restock)
router.patch('/:id/variants/:variantId', auth, admin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT * FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE',
      [req.params.variantId, req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Variant not found' });
    }

    const newStock = Math.max(0, Number(req.body.stock) || 0);
    const wasOut = Number(before.rows[0].stock) === 0;
    const delta = newStock - Number(before.rows[0].stock);

    const { rows } = await client.query(
      'UPDATE product_variants SET stock = $1 WHERE id = $2 RETURNING *',
      [newStock, req.params.variantId]
    );

    if (delta !== 0) {
      await logStockMovement(client, {
        productId: req.params.id, variantId: rows[0].id, change: delta,
        reason: 'admin_adjustment', reference: 'manual restock/adjustment'
      });
    }

    const totalResult = await client.query(
      'SELECT COALESCE(SUM(stock),0)::int AS total FROM product_variants WHERE product_id = $1',
      [req.params.id]
    );
    await client.query('UPDATE products SET stock = $1 WHERE id = $2', [totalResult.rows[0].total, req.params.id]);

    await client.query('COMMIT');

    // Restock notification — fire and forget
    if (wasOut && newStock > 0) {
      notifyRestock(req.params.id, rows[0].id).catch((e) => console.error('restock notify failed:', e.message));
    }

    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('PATCH variant failed:', e.message);
    res.status(400).json({ message: 'Could not update variant' });
  } finally {
    client.release();
  }
});

// GET /api/products/:id/stock-movements — admin: the inventory ledger for a product
router.get('/:id/stock-movements', auth, admin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sm.*, v.size, v.color, v.sku
     FROM stock_movements sm
     LEFT JOIN product_variants v ON v.id = sm.variant_id
     WHERE sm.product_id = $1
     ORDER BY sm.created_at DESC LIMIT 200`,
    [req.params.id]
  );
  res.json(rows);
});


export async function notifyRestock(productId, variantId = null) {
  const product = await pool.query('SELECT id, name FROM products WHERE id = $1', [productId]);
  if (!product.rows.length) return;

  // SKU-aware: a customer who asked to be notified about a specific
  // size/color only gets emailed when THAT combination restocks.
  // Customers who didn't specify a size (variant_id IS NULL — "notify
  // me about this product, any size") still get notified on any
  // restock, which is the intended broader signup.
  const query = variantId
    ? 'SELECT id, email FROM stock_alerts WHERE product_id = $1 AND notified = FALSE AND (variant_id = $2 OR variant_id IS NULL)'
    : 'SELECT id, email FROM stock_alerts WHERE product_id = $1 AND notified = FALSE AND variant_id IS NULL';
  const params = variantId ? [productId, variantId] : [productId];

  const alerts = await pool.query(query, params);
  if (!alerts.rows.length) return;

  // FIX: this used to always send a generic "PRODUCT NAME is back in
  // stock" email, even when the alert was for one specific size/color
  // — confusing on a product with several sizes, since the customer
  // couldn't tell if their size was actually the one that restocked.
  let variantLabel = null;
  if (variantId) {
    const v = await pool.query('SELECT size, color FROM product_variants WHERE id = $1', [variantId]);
    if (v.rows[0]) {
      variantLabel = [v.rows[0].size, v.rows[0].color].filter(Boolean).join(' / ');
    }
  }

  const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/product/${productId}`;
  const { subject, html } = backInStockEmail(product.rows[0].name, url, variantLabel);

  for (const alert of alerts.rows) {
    await sendEmail({ to: alert.email, subject, html });
    await pool.query('UPDATE stock_alerts SET notified = TRUE WHERE id = $1', [alert.id]);

    // Stock alerts are email-only (guests can sign up without an
    // account) — but if that email happens to belong to a registered
    // customer, also drop it in their in-app notification center.
    const account = await pool.query('SELECT id FROM users WHERE email = $1', [alert.email]);
    if (account.rows[0]) {
      createNotification(account.rows[0].id, {
        type: 'back_in_stock',
        title: `${product.rows[0].name}${variantLabel ? ` (${variantLabel})` : ''} is back in stock`,
        link: `/product/${productId}`
      });
    }
  }
}

export default router;
