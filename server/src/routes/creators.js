import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';
import { normalizeCreatorApplication } from '../services/creators.js';

const router = Router();
router.use(auth);

// GET /api/creators/me — application status for the signed-in member
router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, platform, handle, secondary_handle, follower_count, audience, bio,
              status, admin_note, created_at, updated_at
       FROM creator_applications WHERE user_id = $1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (e) {
    console.error('GET /creators/me:', e.message);
    res.status(500).json({ message: 'Could not load creator application' });
  }
});

// POST /api/creators/apply — one application per account; no payout/bank details collected
router.post('/apply', async (req, res) => {
  const normalized = normalizeCreatorApplication(req.body || {});
  if (normalized.error) return res.status(400).json({ message: normalized.error });
  const { platform, handle, secondary_handle, follower_count, audience, bio } = normalized.value;

  try {
    const { rows } = await pool.query(
      `INSERT INTO creator_applications
         (user_id, platform, handle, secondary_handle, follower_count, audience, bio, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING id, platform, handle, secondary_handle, follower_count, audience, bio, status, created_at`,
      [req.user.id, platform, handle, secondary_handle, follower_count, audience, bio]
    );
    if (!rows.length) {
      const existing = await pool.query(
        `SELECT id, platform, handle, secondary_handle, follower_count, audience, bio,
                status, admin_note, created_at, updated_at
         FROM creator_applications WHERE user_id = $1`,
        [req.user.id]
      );
      return res.status(409).json({ message: 'You already have a creator application. You can view its status below.', application: existing.rows[0] });
    }
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /creators/apply:', e.message);
    res.status(500).json({ message: 'Could not submit creator application' });
  }
});

export default router;
