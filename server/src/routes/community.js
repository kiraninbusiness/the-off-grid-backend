import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { normalizePost, publicName, MAX_PENDING_POSTS } from '../services/community.js';
import { optionalUserId } from '../services/clubSpend.js';

const router = Router();

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS community_posts(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        image TEXT NOT NULL,
        caption TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS community_likes(
        post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, user_id)
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS community_posts_status_idx ON community_posts (status, id DESC)');
    })().catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

function shape(r) {
  return { id: r.id, image: r.image, caption: r.caption, status: r.status, created_at: r.created_at, name: publicName(r.user_name), likes: r.likes, liked: r.liked };
}

// GET /api/community?sort=trending|new — approved posts only
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const me = optionalUserId(req) || 0;
    const trending = req.query.sort === 'trending';
    const { rows } = await pool.query(
      `SELECT p.id, p.image, p.caption, p.status, p.created_at, u.name AS user_name,
         (SELECT COUNT(*)::int FROM community_likes l WHERE l.post_id = p.id) AS likes,
         EXISTS (SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked
       FROM community_posts p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'approved' AND ($2::boolean = FALSE OR p.created_at > NOW() - INTERVAL '30 days')
       ORDER BY ${trending ? 'likes DESC, p.id DESC' : 'p.id DESC'}
       LIMIT 60`,
      [me, trending]
    );
    res.json(rows.map(shape));
  } catch (e) {
    console.error('COMMUNITY LIST ERROR:', e.message);
    res.status(500).json({ message: 'Could not load the community feed' });
  }
});

// GET /api/community/mine — the customer's own posts, including ones waiting for approval
router.get('/mine', auth, async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT p.id, p.image, p.caption, p.status, p.created_at, u.name AS user_name,
         (SELECT COUNT(*)::int FROM community_likes l WHERE l.post_id = p.id) AS likes, FALSE AS liked
       FROM community_posts p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 ORDER BY p.id DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(rows.map(shape));
  } catch (e) {
    res.status(500).json({ message: 'Could not load your posts' });
  }
});

// POST /api/community — share an outfit photo (uploaded through /api/upload/review-photo). Needs approval.
router.post('/', auth, async (req, res) => {
  const r = normalizePost(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  try {
    await ensureTable();
    const pending = await pool.query(`SELECT COUNT(*)::int AS n FROM community_posts WHERE user_id = $1 AND status = 'pending'`, [req.user.id]);
    if (pending.rows[0].n >= MAX_PENDING_POSTS) {
      return res.status(429).json({ message: 'You already have several photos waiting for approval. Please wait for them to be reviewed.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO community_posts (user_id, image, caption) VALUES ($1,$2,$3) RETURNING id, status`,
      [req.user.id, r.value.image, r.value.caption]
    );
    res.status(201).json({ ...rows[0], message: 'Thanks! Your photo will appear once our team approves it.' });
  } catch (e) {
    console.error('COMMUNITY POST ERROR:', e.message);
    res.status(500).json({ message: 'Could not share your photo' });
  }
});

router.post('/:id/like', auth, async (req, res) => {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO community_likes (post_id, user_id)
       SELECT id, $2 FROM community_posts WHERE id = $1 AND status = 'approved' ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: 'Could not like this photo' });
  }
});

router.delete('/:id/like', auth, async (req, res) => {
  try {
    await ensureTable();
    await pool.query('DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: 'Could not update your like' });
  }
});

// Admin moderation
router.get('/admin/all', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT p.id, p.image, p.caption, p.status, p.created_at, u.name AS user_name, 0 AS likes, FALSE AS liked
       FROM community_posts p JOIN users u ON u.id = p.user_id
       ORDER BY (p.status = 'pending') DESC, p.id DESC LIMIT 100`
    );
    res.json(rows.map((r) => ({ ...shape(r), name: r.user_name })));
  } catch (e) {
    res.status(500).json({ message: 'Could not load posts' });
  }
});

router.patch('/admin/:id', auth, admin, async (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'status must be approved or rejected' });
  try {
    await ensureTable();
    const { rows } = await pool.query('UPDATE community_posts SET status = $1 WHERE id = $2 RETURNING id, status', [status, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Post not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Could not update post' });
  }
});

router.delete('/admin/:id', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    await pool.query('DELETE FROM community_posts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not delete post' });
  }
});

export default router;
