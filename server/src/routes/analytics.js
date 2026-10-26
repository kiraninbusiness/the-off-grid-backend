import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { normalizeEventName } from '../services/analyticsEvents.js';

const router = Router();

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS app_event_counts(
          day DATE NOT NULL,
          event TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (day, event)
        )`
      )
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

// POST /api/analytics/events — anonymous counter. Properties in the body are ignored on purpose.
router.post('/events', async (req, res) => {
  const event = normalizeEventName(req.body);
  if (!event) return res.status(400).json({ message: 'Unknown event' });
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO app_event_counts (day, event, count) VALUES ((NOW() AT TIME ZONE 'Asia/Kolkata')::date, $1, 1)
       ON CONFLICT (day, event) DO UPDATE SET count = app_event_counts.count + 1`,
      [event]
    );
    res.status(202).json({ ok: true });
  } catch (e) {
    console.error('ANALYTICS EVENT FAILED:', e.message);
    res.status(500).json({ message: 'Could not record the event' });
  }
});

// GET /api/analytics/events?days=7 — admin only: daily counts per event.
router.get('/events', auth, admin, async (req, res) => {
  const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 7));
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT day::text, event, count FROM app_event_counts
        WHERE day > (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $1::int
        ORDER BY day DESC, event`,
      [days]
    );
    res.json({ days, rows });
  } catch (e) {
    console.error('ANALYTICS SUMMARY FAILED:', e.message);
    res.status(500).json({ message: 'Could not load analytics' });
  }
});

export default router;
