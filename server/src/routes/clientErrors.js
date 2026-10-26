import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { normalizeErrorReport, errorFingerprint } from '../services/clientErrors.js';

const router = Router();

// Same lazy-table approach as routes/contact.js: created on first use, no change to initDb.
let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS client_errors(
          id SERIAL PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          message TEXT NOT NULL,
          stack TEXT,
          source TEXT,
          screen TEXT,
          app_version TEXT,
          platform TEXT,
          os_version TEXT,
          fatal BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );
      await pool.query('CREATE INDEX IF NOT EXISTS client_errors_created_idx ON client_errors (created_at)');
      await pool.query('CREATE INDEX IF NOT EXISTS client_errors_fingerprint_idx ON client_errors (fingerprint)');
    })().catch((e) => {
      tableReady = null; // try again on the next request
      throw e;
    });
  }
  return tableReady;
}

const RETENTION_DAYS = 90;

// POST /api/client-errors — the mobile app reports a JavaScript error. No sign-in
// required (the app may crash before login); no account or personal data is stored.
router.post('/', async (req, res) => {
  const report = normalizeErrorReport(req.body);
  if (!report) return res.status(400).json({ message: 'An error message is required' });

  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO client_errors (fingerprint, message, stack, source, screen, app_version, platform, os_version, fatal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        errorFingerprint(report),
        report.message,
        report.stack,
        report.source,
        report.screen,
        report.app_version,
        report.platform,
        report.os_version,
        report.fatal,
      ]
    );
    // Housekeeping so the table cannot grow without limit: occasionally drop old rows.
    if (Math.random() < 0.02) {
      pool
        .query(`DELETE FROM client_errors WHERE created_at < NOW() - make_interval(days => $1)`, [RETENTION_DAYS])
        .catch(() => {});
    }
    res.status(202).json({ ok: true });
  } catch (e) {
    console.error('CLIENT ERROR REPORT FAILED:', e.message);
    res.status(500).json({ message: 'Could not record the report' });
  }
});

// GET /api/client-errors?days=7 — admin only. The same error grouped together, most frequent first.
router.get('/', auth, admin, async (req, res) => {
  const days = Math.min(RETENTION_DAYS, Math.max(1, Number.parseInt(req.query.days, 10) || 7));
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT fingerprint,
              (array_agg(message ORDER BY id DESC))[1] AS message,
              (array_agg(stack ORDER BY id DESC))[1] AS stack,
              (array_agg(screen ORDER BY id DESC))[1] AS screen,
              (array_agg(app_version ORDER BY id DESC))[1] AS app_version,
              (array_agg(platform ORDER BY id DESC))[1] AS platform,
              COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE fatal)::int AS fatal_count,
              MAX(created_at) AS last_seen
         FROM client_errors
        WHERE created_at > NOW() - make_interval(days => $1)
        GROUP BY fingerprint
        ORDER BY count DESC, last_seen DESC
        LIMIT 100`,
      [days]
    );
    res.json({ days, total: rows.reduce((n, r) => n + r.count, 0), groups: rows });
  } catch (e) {
    console.error('CLIENT ERROR SUMMARY FAILED:', e.message);
    res.status(500).json({ message: 'Could not load error reports' });
  }
});

export default router;
