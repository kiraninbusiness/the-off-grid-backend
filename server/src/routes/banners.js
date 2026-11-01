import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { normalizeBanner } from '../services/banners.js';

const router = Router();

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS home_banners(
          id SERIAL PRIMARY KEY,
          image TEXT NOT NULL,
          kicker TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          copy TEXT NOT NULL DEFAULT '',
          cta TEXT NOT NULL DEFAULT 'SHOP NOW',
          link TEXT NOT NULL DEFAULT '/(tabs)/shop',
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

// GET /api/banners — public: active banners for the app's Home carousel
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT id, image, kicker, title, copy, cta, link FROM home_banners WHERE active = TRUE ORDER BY sort_order, id DESC LIMIT 6');
    res.json(rows);
  } catch (e) {
    console.error('BANNERS LIST ERROR:', e.message);
    res.status(500).json({ message: 'Could not load banners' });
  }
});

// GET /api/banners/all — admin: including hidden
router.get('/all', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT * FROM home_banners ORDER BY sort_order, id DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Could not load banners' });
  }
});

router.post('/', auth, admin, async (req, res) => {
  const r = normalizeBanner(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  const b = r.value;
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `INSERT INTO home_banners (image, kicker, title, copy, cta, link, sort_order, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.image, b.kicker, b.title, b.copy, b.cta, b.link, b.sort_order, b.active]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('BANNER CREATE ERROR:', e.message);
    res.status(500).json({ message: 'Could not save the banner' });
  }
});

router.patch('/:id', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    const cur = (await pool.query('SELECT * FROM home_banners WHERE id = $1', [req.params.id])).rows[0];
    if (!cur) return res.status(404).json({ message: 'Banner not found' });
    const r = normalizeBanner({ ...cur, ...req.body });
    if (r.error) return res.status(400).json({ message: r.error });
    const b = r.value;
    const { rows } = await pool.query(
      `UPDATE home_banners SET image=$1, kicker=$2, title=$3, copy=$4, cta=$5, link=$6, sort_order=$7, active=$8 WHERE id=$9 RETURNING *`,
      [b.image, b.kicker, b.title, b.copy, b.cta, b.link, b.sort_order, b.active, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('BANNER UPDATE ERROR:', e.message);
    res.status(500).json({ message: 'Could not update the banner' });
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    const { rowCount } = await pool.query('DELETE FROM home_banners WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Banner not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not delete the banner' });
  }
});

export default router;
