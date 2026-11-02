import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { normalizeLook } from '../services/looks.js';
import { meetsTier, TIERS, tierRank } from '../services/club.js';
import { deliveredSpend, optionalUserId } from '../services/clubSpend.js';

const router = Router();

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS looks(
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          image TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          creator TEXT NOT NULL DEFAULT '',
          product_ids INTEGER[] NOT NULL DEFAULT '{}',
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      )
      .then(() => pool.query('ALTER TABLE looks ADD COLUMN IF NOT EXISTS min_tier TEXT'))
      .catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

// Products of each look, in the order the admin picked them. Products that are gone are skipped.
async function withProducts(looks) {
  const ids = [...new Set(looks.flatMap((l) => l.product_ids))];
  const byId = {};
  if (ids.length) {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = ANY($1::int[])', [ids]);
    for (const p of rows) byId[p.id] = p;
  }
  return looks.map((l) => ({ ...l, products: l.product_ids.map((id) => byId[id]).filter(Boolean) }));
}

// GET /api/looks — public: live looks
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT * FROM looks WHERE active = TRUE ORDER BY sort_order, id DESC LIMIT 30');
    const spend = await deliveredSpend(pool, optionalUserId(req));
    // Members-only collections are listed for everyone, but only unlocked for the right tier.
    res.json(
      (await withProducts(rows))
        .filter((l) => l.products.length >= 2)
        .map((l) => {
          const locked = !meetsTier(spend, l.min_tier);
          return locked ? { ...l, locked: true, products: l.products.slice(0, 0), product_count: l.product_ids.length } : { ...l, locked: false, product_count: l.product_ids.length };
        })
    );
  } catch (e) {
    console.error('LOOKS LIST ERROR:', e.message);
    res.status(500).json({ message: 'Could not load looks' });
  }
});

// GET /api/looks/all — admin: including hidden
router.get('/all', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT * FROM looks ORDER BY sort_order, id DESC');
    res.json(await withProducts(rows));
  } catch (e) {
    res.status(500).json({ message: 'Could not load looks' });
  }
});

router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ message: 'Look not found' });
  try {
    await ensureTable();
    const { rows } = await pool.query('SELECT * FROM looks WHERE id = $1 AND active = TRUE', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Look not found' });
    if (!meetsTier(await deliveredSpend(pool, optionalUserId(req)), rows[0].min_tier)) {
      const name = (TIERS[tierRank(rows[0].min_tier)] || TIERS[0]).name;
      return res.status(403).json({ message: `This collection is for ${name} members and above.` });
    }
    res.json((await withProducts(rows))[0]);
  } catch (e) {
    res.status(500).json({ message: 'Could not load look' });
  }
});

router.post('/', auth, admin, async (req, res) => {
  const r = normalizeLook(req.body);
  if (r.error) return res.status(400).json({ message: r.error });
  const l = r.value;
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `INSERT INTO looks (title, image, description, creator, product_ids, sort_order, active, min_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [l.title, l.image, l.description, l.creator, l.product_ids, l.sort_order, l.active, l.min_tier]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('LOOK CREATE ERROR:', e.message);
    res.status(500).json({ message: 'Could not save look' });
  }
});

router.patch('/:id', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    if (typeof req.body?.active === 'boolean' && Object.keys(req.body).length === 1) {
      const { rows } = await pool.query('UPDATE looks SET active = $1 WHERE id = $2 RETURNING *', [req.body.active, req.params.id]);
      return rows.length ? res.json(rows[0]) : res.status(404).json({ message: 'Look not found' });
    }
    const r = normalizeLook(req.body);
    if (r.error) return res.status(400).json({ message: r.error });
    const l = r.value;
    const { rows } = await pool.query(
      `UPDATE looks SET title=$1, image=$2, description=$3, creator=$4, product_ids=$5, sort_order=$6, active=$7, min_tier=$8 WHERE id=$9 RETURNING *`,
      [l.title, l.image, l.description, l.creator, l.product_ids, l.sort_order, l.active, l.min_tier, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Look not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ message: 'Could not update look' });
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await ensureTable();
    await pool.query('DELETE FROM looks WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not delete look' });
  }
});

export default router;
