import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

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
  const platform = cleanText(req.body?.platform, 24).toLowerCase();
  const handle = cleanText(req.body?.handle, 80).replace(/^@/, '');
  const secondary = cleanText(req.body?.secondary_handle, 80).replace(/^@/, '');
  const audience = cleanText(req.body?.audience, 80);
  const bio = cleanText(req.body?.bio, 600);
  const followerCount = Number(req.body?.follower_count);

  if (!['instagram', 'youtube', 'tiktok'].includes(platform)) {
    return res.status(400).json({ message: 'Choose Instagram, YouTube or TikTok as your main platform' });
  }
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) {
    return res.status(400).json({ message: 'Enter a valid public profile handle' });
  }
  if (secondary && !/^[A-Za-z0-9._-]{2,80}$/.test(secondary)) {
    return res.status(400).json({ message: 'Enter a valid secondary profile handle' });
  }
  if (!Number.isInteger(followerCount) || followerCount < 0 || followerCount > 100000000) {
    return res.status(400).json({ message: 'Enter a valid follower count' });
  }
  if (audience.length < 2 || bio.length < 20) {
    return res.status(400).json({ message: 'Tell us about your audience and your content (at least 20 characters)' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO creator_applications
         (user_id, platform, handle, secondary_handle, follower_count, audience, bio, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING id, platform, handle, secondary_handle, follower_count, audience, bio, status, created_at`,
      [req.user.id, platform, handle, secondary || null, followerCount, audience, bio]
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
