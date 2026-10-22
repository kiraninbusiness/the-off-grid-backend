import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// POST — subscribe an email. Idempotent: re-subscribing an existing
// email is treated as a success rather than an error.
router.post('/', async (req, res) => {
  const { email } = req.body;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'A valid email is required' });
  }

  try {
    await pool.query(
      `INSERT INTO newsletter_subscribers (email)
       VALUES ($1)
       ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase().trim()]
    );

    res.status(201).json({ message: 'Subscribed' });
  } catch (err) {
    res.status(500).json({ message: 'Could not subscribe right now' });
  }
});

export default router;
