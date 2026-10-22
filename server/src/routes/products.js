import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { notifyRestock } from './variants.js';
import { sendEmail, priceDropEmail } from '../services/email.js';
import { createNotification } from '../services/notifications.js';
import { logAdminAction } from '../services/auditLog.js';

const router = Router();

/*
  GET /api/products
  Lists products with optional filters — this endpoint powers the shop
  grid, search, and category/color/fit filters on the storefront.
  Query params (all optional): category, gender, color, fit, q (search),
  sort (price_asc | price_high | name | newest), min, max.
*/
router.get('/', async (req, res) => {
  try {
    const { category, gender, color, fit, q, sort, min, max } = req.query;
    const where = [];
    const values = [];

    if (category && category.toUpperCase() !== 'ALL') {
      values.push(category);
      where.push(`LOWER(category) = LOWER($${values.length})`);
    }
    if (gender && gender.toUpperCase() !== 'ALL') {
      values.push(gender);
      where.push(`LOWER(gender) = LOWER($${values.length})`);
    }
    if (color) {
      values.push(color);
      where.push(`LOWER(color) = LOWER($${values.length})`);
    }
    if (fit) {
      values.push(fit);
      where.push(`LOWER(fit) = LOWER($${values.length})`);
    }
    if (q) {
      values.push(`%${q}%`);
      where.push(`(name ILIKE $${values.length} OR description ILIKE $${values.length} OR category ILIKE $${values.length})`);
    }
    if (min) {
      values.push(Number(min));
      where.push(`price >= $${values.length}`);
    }
    if (max) {
      values.push(Number(max));
      where.push(`price <= $${values.length}`);
    }

    let orderBy = 'created_at DESC';
    if (sort === 'price_asc') orderBy = 'price ASC';
    else if (sort === 'price_high') orderBy = 'price DESC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'newest') orderBy = 'created_at DESC';

    /*
      PAGINATION (opt-in, backward compatible)
      Passing ?page=1&limit=24 returns {items,total,page,pages}
      instead of a bare array. No page param -> unchanged behaviour
      (full array), which is what the current storefront relies on
      for its client-side filtering. Wire this up on the frontend
      once the catalogue is large enough that shipping every product
      up front stops making sense — the API is ready for it now.
    */
    const page = req.query.page ? Math.max(1, Number(req.query.page)) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));

    if (page) {
      const countSql = `SELECT COUNT(*)::int AS total FROM products p ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
      const countResult = await pool.query(countSql, values);
      const total = countResult.rows[0].total;

      const pagedValues = [...values, limit, (page - 1) * limit];
      const sql = `
        SELECT p.*,
          COALESCE(
            (SELECT json_agg(v ORDER BY v.size, v.color) FROM product_variants v WHERE v.product_id = p.id),
            '[]'
          ) AS variants
        FROM products p
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${orderBy}
        LIMIT $${pagedValues.length - 1} OFFSET $${pagedValues.length}
      `;
      const { rows } = await pool.query(sql, pagedValues);
      return res.json({ items: rows, total, page, pages: Math.ceil(total / limit) });
    }

    const sql = `
      SELECT p.*,
        COALESCE(
          (SELECT json_agg(v ORDER BY v.size, v.color) FROM product_variants v WHERE v.product_id = p.id),
          '[]'
        ) AS variants
      FROM products p
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy}
    `;
    const { rows } = await pool.query(sql, values);
    res.json(rows);
  } catch (e) {
    console.error('GET /products failed:', e);
    res.status(500).json({ message: 'Unable to load products' });
  }
});

// GET /api/products/:id — single product detail. Accepts either a
// numeric id or a slug (e.g. /products/oversized-black-tee-14), so the
// same endpoint serves both /product/:id and the pretty /product/:id/:slug
// frontend route.
router.get('/:id', async (req, res) => {
  try {
    const isNumeric = /^\d+$/.test(req.params.id);
    const { rows } = await pool.query(
      `SELECT p.*,
        COALESCE(
          (SELECT json_agg(v ORDER BY v.size, v.color) FROM product_variants v WHERE v.product_id = p.id),
          '[]'
        ) AS variants
       FROM products p WHERE ${isNumeric ? 'p.id = $1' : 'p.slug = $1'}`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /products/:id failed:', e);
    res.status(500).json({ message: 'Unable to load product' });
  }
});

function slugify(name, id) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return id ? `${base}-${id}` : base;
}

// POST /api/products — create (admin only)
router.post('/', auth, admin, async (req, res) => {
  try {
    const {
      name, description = '', category, gender = 'Unisex', size,
      condition = 'New Arrival', price, old_price = null, image,
      images = [], stock = 1, color = null, fit = null, video = null,
      meta_title = null, meta_description = null,
      material = null, care_instructions = null, model_details = null
    } = req.body;

    if (!name || !category || !size || !price || !image) {
      return res.status(400).json({ message: 'name, category, size, price and image are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO products
        (name, description, category, gender, size, condition, price, old_price, image, images, stock, color, fit, video, meta_title, meta_description, material, care_instructions, model_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [name, description, category, gender, size, condition, Number(price), old_price ? Number(old_price) : null,
        image, Array.isArray(images) ? images : [], Number(stock) || 0, color, fit, video, meta_title, meta_description,
        material, care_instructions, model_details]
    );

    // Slug depends on the new row's id, so it's set right after insert.
    const slug = slugify(name, rows[0].id);
    const withSlug = await pool.query('UPDATE products SET slug = $1 WHERE id = $2 RETURNING *', [slug, rows[0].id]);

    res.status(201).json(withSlug.rows[0]);
  } catch (e) {
    console.error('POST /products failed:', e);
    res.status(500).json({ message: 'Unable to create product' });
  }
});

// PATCH /api/products/:id — update (admin only)
router.patch('/:id', auth, admin, async (req, res) => {
  try {
    const fields = ['name', 'description', 'category', 'gender', 'size', 'condition', 'price', 'old_price', 'image', 'images', 'stock', 'color', 'fit', 'video', 'meta_title', 'meta_description', 'slug', 'material', 'care_instructions', 'model_details', 'size_chart'];
    const sets = [];
    const values = [];

    const before = await pool.query('SELECT stock, price FROM products WHERE id = $1', [req.params.id]);
    const wasOut = before.rows.length && Number(before.rows[0].stock) === 0;
    const priceBefore = before.rows.length ? Number(before.rows[0].price) : null;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'images') value = Array.isArray(value) ? value : [];
        if (field === 'size_chart') value = value === null ? null : JSON.stringify(Array.isArray(value) ? value : []);
        values.push(value);
        sets.push(`${field} = $${values.length}`);
      }
    }

    if (!sets.length) return res.status(400).json({ message: 'No fields to update' });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (!rows.length) return res.status(404).json({ message: 'Product not found' });

    // Product came back in stock — notify anyone on the waitlist (fire and forget)
    if (wasOut && Number(rows[0].stock) > 0) {
      notifyRestock(rows[0].id).catch((e) => console.error('restock notify failed:', e.message));
    }

    // Price dropped — notify wishlisters whose saved price was higher (fire and forget)
    const newPrice = Number(rows[0].price);
    if (priceBefore !== null && newPrice < priceBefore) {
      notifyPriceDrop(rows[0], priceBefore).catch((e) => console.error('price drop notify failed:', e.message));
    }

    if (priceBefore !== null && newPrice !== priceBefore) {
      logAdminAction(req, {
        action: 'product_price_changed', entity: 'product', entityId: rows[0].id,
        oldValue: { price: priceBefore }, newValue: { price: newPrice }
      });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /products/:id failed:', e);
    res.status(500).json({ message: 'Unable to update product' });
  }
});

// DELETE /api/products/:id — remove (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const before = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const { rows } = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });
    logAdminAction(req, { action: 'product_deleted', entity: 'product', entityId: req.params.id, oldValue: before.rows[0] || null });
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /products/:id failed:', e);
    res.status(500).json({ message: 'Unable to delete product' });
  }
});

// POST /api/products/:id/notify — "notify me" waitlist for out-of-stock items
// Now SKU-aware: if the product has variants and the customer specifies a
// size/color, they're only notified when THAT combination restocks —
// not just when any size of the product comes back.
router.post('/:id/notify', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const size = req.body.size ? String(req.body.size).trim() : null;
    const color = req.body.color ? String(req.body.color).trim() : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Invalid email' });

    const { rows } = await pool.query('SELECT id, name FROM products WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });

    let variantId = null;
    if (size) {
      const v = await pool.query(
        'SELECT id FROM product_variants WHERE product_id = $1 AND size = $2 AND color = $3',
        [req.params.id, size, color]
      );
      variantId = v.rows[0]?.id || null;
    }

    const existing = await pool.query(
      `SELECT id FROM stock_alerts WHERE product_id = $1 AND email = $2
       AND (variant_id = $3 OR ($3::int IS NULL AND variant_id IS NULL))`,
      [req.params.id, email, variantId]
    );
    if (!existing.rows.length) {
      await pool.query(
        'INSERT INTO stock_alerts (product_id, email, variant_id) VALUES ($1,$2,$3)',
        [req.params.id, email, variantId]
      );
    }

    res.json({ success: true });
  } catch (e) {
    console.error('POST /products/:id/notify failed:', e);
    res.status(500).json({ message: 'Unable to save alert' });
  }
});

export default router;

/*
  WISHLIST PRICE-DROP NOTIFICATIONS

  Anyone who wishlisted this product at a higher price gets emailed —
  and their saved price is updated to the new one, so the next drop
  below THAT triggers again (rather than emailing on every future
  price change regardless of direction/size).
*/
async function notifyPriceDrop(product, oldPrice) {
  const { rows: wishlisters } = await pool.query(
    `SELECT w.id, w.last_known_price, u.id AS user_id, u.email
     FROM wishlist_items w
     JOIN users u ON u.id = w.user_id
     WHERE w.product_id = $1 AND w.last_known_price > $2`,
    [product.id, product.price]
  );
  if (!wishlisters.length) return;

  const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/product/${product.id}`;

  for (const w of wishlisters) {
    const { subject, html } = priceDropEmail(product.name, w.last_known_price, product.price, url, product.image);
    await sendEmail({ to: w.email, subject, html });
    await pool.query('UPDATE wishlist_items SET last_known_price = $1 WHERE id = $2', [product.price, w.id]);
    createNotification(w.user_id, {
      type: 'price_drop',
      title: `Price drop: ${product.name} is now ₹${product.price}`,
      link: `/product/${product.id}`
    });
  }
}
