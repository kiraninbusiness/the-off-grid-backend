import { Router } from 'express';
import { pool } from '../db.js';
import { auth } from '../middleware/auth.js';

const router = Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_addresses(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'HOME',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses(user_id);`);
}

router.use(auth, async (_req, _res, next) => {
  try { await ensureTable(); next(); }
  catch (e) { next(e); }
});

router.get('/addresses', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM customer_addresses WHERE user_id=$1 ORDER BY is_default DESC, created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/addresses', async (req, res) => {
  const { label='HOME', name, phone, address, city, state, pincode, is_default=false } = req.body;
  const clean = {
    label: String(label || 'HOME').trim().slice(0, 30).toUpperCase(),
    name: String(name || '').trim(),
    phone: String(phone || '').replace(/\D/g, ''),
    address: String(address || '').trim(),
    city: String(city || '').trim(),
    state: String(state || '').trim(),
    pincode: String(pincode || '').replace(/\D/g, '')
  };
  if (!clean.name || !/^\d{10}$/.test(clean.phone) || !clean.address || !clean.city || !clean.state || !/^\d{6}$/.test(clean.pincode)) {
    return res.status(400).json({ message: 'Please provide valid address details.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (is_default) await client.query('UPDATE customer_addresses SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    const { rows } = await client.query(
      `INSERT INTO customer_addresses(user_id,label,name,phone,address,city,state,pincode,is_default)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, clean.label, clean.name, clean.phone, clean.address, clean.city, clean.state, clean.pincode, Boolean(is_default)]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ message: 'Could not save address.' });
  } finally { client.release(); }
});

router.patch('/addresses/:id', async (req, res) => {
  const allowed = ['label','name','phone','address','city','state','pincode','is_default'];
  const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!entries.length) return res.status(400).json({ message: 'Nothing to update.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (entries.some(([k,v]) => k === 'is_default' && Boolean(v))) await client.query('UPDATE customer_addresses SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    const values = entries.map(([k,v]) => k === 'phone' || k === 'pincode' ? String(v || '').replace(/\D/g, '') : k === 'label' ? String(v || 'HOME').trim().slice(0,30).toUpperCase() : v);
    values.push(req.params.id, req.user.id);
    const set = entries.map(([k], i) => `${k}=$${i+1}`).join(',');
    const { rows } = await client.query(`UPDATE customer_addresses SET ${set} WHERE id=$${values.length-1} AND user_id=$${values.length} RETURNING *`, values);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Address not found.' }); }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(400).json({ message: 'Could not update address.' }); }
  finally { client.release(); }
});

router.delete('/addresses/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM customer_addresses WHERE id=$1 AND user_id=$2 RETURNING id', [req.params.id, req.user.id]);
  if (!result.rows.length) return res.status(404).json({ message: 'Address not found.' });
  res.status(204).end();
});

router.post('/addresses/:id/default', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM customer_addresses WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!exists.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Address not found.' }); }
    await client.query('UPDATE customer_addresses SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    const { rows } = await client.query('UPDATE customer_addresses SET is_default=TRUE WHERE id=$1 AND user_id=$2 RETURNING *', [req.params.id, req.user.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(400).json({ message: 'Could not set default address.' }); }
  finally { client.release(); }
});

export default router;
