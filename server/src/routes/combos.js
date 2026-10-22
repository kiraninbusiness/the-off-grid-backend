import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';

const router = Router();

// GET /api/combos — public, active deals shown as banners/PDP callouts
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM combo_deals WHERE active = TRUE ORDER BY created_at DESC');
  res.json(rows);
});

// GET /api/combos/all — admin: including inactive
router.get('/all', auth, admin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM combo_deals ORDER BY created_at DESC');
  res.json(rows);
});

// POST /api/combos — admin: create a deal, e.g. "any 3 T-SHIRTS for ₹1999"
router.post('/', auth, admin, async (req, res) => {
  const { title, category, quantity, bundle_price } = req.body;

  if (!title || !category || !Number(quantity) || !Number(bundle_price)) {
    return res.status(400).json({ message: 'title, category, quantity and bundle_price are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO combo_deals (title, category, quantity, bundle_price)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [title.trim(), category.trim(), Number(quantity), Number(bundle_price)]
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/combos/:id — admin: update or toggle active
router.patch('/:id', auth, admin, async (req, res) => {
  const fields = ['title', 'category', 'quantity', 'bundle_price', 'active'];
  const sets = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      values.push(req.body[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ message: 'No fields to update' });

  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE combo_deals SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows.length) return res.status(404).json({ message: 'Deal not found' });
  res.json(rows[0]);
});

// DELETE /api/combos/:id — admin
router.delete('/:id', auth, admin, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM combo_deals WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Deal not found' });
  res.json({ success: true });
});

export default router;
