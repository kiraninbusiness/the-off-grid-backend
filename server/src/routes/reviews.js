import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';
import { sanitizeText } from '../utils/sanitize.js';
import { normalizePhotoUrls } from '../services/reviewPhotos.js';

const router = Router();

// GET all reviews for a product, newest first, plus a rating summary
router.get('/:productId', async (req, res) => {
  const { productId } = req.params;

  const { rows } = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, r.verified_purchase, r.fit_feedback, u.name AS user_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 AND r.hidden = FALSE
     ORDER BY r.created_at DESC`,
    [productId]
  );

  // Only photos an admin approved are public.
  const photoRows = rows.length
    ? (await pool.query(`SELECT review_id, url FROM review_photos WHERE status = 'approved' AND review_id = ANY($1::int[]) ORDER BY id`, [rows.map((x) => x.id)])).rows
    : [];
  for (const row of rows) row.photos = photoRows.filter((p) => p.review_id === row.id).map((p) => p.url);

  const count = rows.length;
  const average = count
    ? rows.reduce((sum, r) => sum + r.rating, 0) / count
    : 0;

  res.json({
    reviews: rows,
    summary: {
      count,
      average: Math.round(average * 10) / 10
    }
  });
});

// POST a review — one per user per product. Editing re-submits (upsert).
router.post('/:productId', auth, async (req, res) => {
  const { productId } = req.params;
  const { rating, comment = '', fit_feedback = null } = req.body;

  const ratingNum = Number(rating);

  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  if (!/^\d+$/.test(String(productId)) || Number(productId) <= 0) return res.status(400).json({ message: 'Invalid product' });

  const photoResult = normalizePhotoUrls(req.body.photos);
  if (photoResult.error) return res.status(400).json({ message: photoResult.error });

  const cleanComment = sanitizeText(comment, 1000);
  const normalizedFit = fit_feedback == null || String(fit_feedback).trim() === '' ? null : String(fit_feedback).trim().toLowerCase().replace(/[_-]+/g, ' ');
  const allowedFits = new Set(['true to size', 'runs small', 'runs large']);
  if (normalizedFit !== null && !allowedFits.has(normalizedFit)) {
    return res.status(400).json({ message: 'Fit feedback must be true to size, runs small, or runs large' });
  }

  const purchase = await pool.query(
    `SELECT 1
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = $1
       AND o.user_id = $2
       AND o.status = 'delivered'
     LIMIT 1`,
    [productId, req.user.id]
  );

  const verifiedPurchase = purchase.rows.length > 0;

  const { rows } = await pool.query(
    `INSERT INTO reviews (product_id, user_id, rating, comment, verified_purchase, fit_feedback)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (product_id, user_id)
     DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, verified_purchase = EXCLUDED.verified_purchase, fit_feedback = EXCLUDED.fit_feedback, created_at = NOW()
     RETURNING id, rating, comment, verified_purchase, fit_feedback, created_at`,
    [productId, req.user.id, ratingNum, cleanComment, verifiedPurchase, normalizedFit]
  );

  // New photos always start as "pending"; sending photos replaces the earlier ones.
  if (!photoResult.skip) {
    await pool.query('DELETE FROM review_photos WHERE review_id = $1', [rows[0].id]);
    for (const url of photoResult.urls) {
      await pool.query(`INSERT INTO review_photos (review_id, url, status) VALUES ($1, $2, 'pending')`, [rows[0].id, url]);
    }
  }

  res.status(201).json({
    ...rows[0],
    photos_pending: photoResult.skip ? 0 : photoResult.urls.length,
    user_name: req.user.name || 'You'
  });
});

export default router;
