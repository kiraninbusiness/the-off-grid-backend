import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { sanitizeText } from '../utils/sanitize.js';

const router = Router();

async function ensureTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS contact_messages(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT 'general',
      message TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
}

const TOPICS = ['order-tracking', 'payment', 'return', 'exchange', 'refund', 'sizing', 'general'];

// POST /api/contact — customer support / "Get in Touch" form submission.
router.post('/', async (req, res) => {
  const name = sanitizeText(req.body.name, 100);
  const email = String(req.body.email || '').trim().toLowerCase();
  const message = sanitizeText(req.body.message, 2000);
  const topic = TOPICS.includes(req.body.topic) ? req.body.topic : 'general';

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message) {
    return res.status(400).json({ message: 'Name, a valid email, and a message are required' });
  }

  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO contact_messages (name, email, topic, message) VALUES ($1,$2,$3,$4)`,
      [name, email, topic, message]
    );
    res.status(201).json({ message: 'Received' });
  } catch (e) {
    console.error('POST /contact failed:', e);
    res.status(500).json({ message: 'Could not send your message right now' });
  }
});

// GET /api/contact — admin inbox
router.get('/', auth, admin, async (req, res) => {
  await ensureTable();
  const { rows } = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200');
  res.json(rows);
});

// PATCH /api/contact/:id — mark resolved (admin only)
router.patch('/:id', auth, admin, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE contact_messages SET resolved = $1 WHERE id = $2 RETURNING *`,
    [!!req.body.resolved, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Message not found' });
  res.json(rows[0]);
});

export default router;
