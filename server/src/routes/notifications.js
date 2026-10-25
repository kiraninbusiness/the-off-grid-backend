import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();
router.use(auth);

router.post('/push-token', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const platform = String(req.body?.platform || '').trim().toLowerCase();
  if (!/^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token) || token.length > 500) {
    return res.status(400).json({ message: 'A valid Expo push token is required.' });
  }
  if (!['ios', 'android'].includes(platform)) {
    return res.status(400).json({ message: 'Unsupported push-token platform.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO user_push_tokens (user_id, token, platform, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       updated_at = NOW()
     RETURNING id, platform`,
    [req.user.id, token, platform]
  );
  res.status(200).json({ success: true, registered: true, platform: rows[0].platform });
});

// GET /api/notifications — most recent 50, newest first
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

// GET /api/notifications/unread-count — for the bell badge
router.get('/unread-count', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ count: rows[0].count });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Notification not found' });
  res.json(rows[0]);
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ success: true });
});

export default router;
