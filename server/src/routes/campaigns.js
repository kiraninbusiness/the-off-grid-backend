import { Router } from 'express';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { createNotification } from '../services/notifications.js';
import { tierFor } from '../services/club.js';
import { deliveredSpend } from '../services/clubSpend.js';
import { birthdayPercent, periodKey, offerCode, offerExpiry, WINBACK_AFTER_DAYS, WINBACK_PERCENT } from '../services/campaigns.js';

const router = Router();

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool
      .query(`CREATE TABLE IF NOT EXISTS campaign_sends(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        period TEXT NOT NULL,
        coupon_code TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, kind, period)
      )`)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

// Claims the (customer, kind, period) slot first, so two overlapping sweeps cannot both send.
async function sendOffer(user, kind, { prefix, percent, title, body, now }) {
  const claim = await pool.query(
    `INSERT INTO campaign_sends (user_id, kind, period) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
    [user.id, kind, periodKey(kind, now)]
  );
  if (!claim.rows.length) return false;
  const code = offerCode(prefix);
  try {
    await pool.query(
      `INSERT INTO coupons (code, type, value, min_order, usage_limit, expires_at, is_public)
       VALUES ($1,'percent',$2,0,1,$3,FALSE)`,
      [code, percent, offerExpiry(now)]
    );
    await pool.query('UPDATE campaign_sends SET coupon_code = $1 WHERE id = $2', [code, claim.rows[0].id]);
  } catch (e) {
    await pool.query('DELETE FROM campaign_sends WHERE id = $1', [claim.rows[0].id]).catch(() => {});
    throw e;
  }
  await createNotification(user.id, { type: 'offer', title, body: body.replace('{code}', code), link: '/cart' });
  return true;
}

export async function runCampaignSweep(now = new Date()) {
  await ensureTable();
  const result = { birthday: 0, winback: 0 };

  const birthdays = await pool.query(
    `SELECT id, name FROM users WHERE birthday IS NOT NULL AND EXTRACT(MONTH FROM birthday) = $1`,
    [now.getUTCMonth() + 1]
  );
  for (const u of birthdays.rows) {
    const tier = tierFor(await deliveredSpend(pool, u.id));
    const percent = birthdayPercent(tier.key);
    const sent = await sendOffer(u, 'birthday', {
      prefix: 'BDAY', percent, now,
      title: `Happy birthday, ${String(u.name || '').split(' ')[0] || 'friend'}!`,
      body: `Here is ${percent}% off, just for you. Use code {code} within 14 days.`,
    });
    if (sent) result.birthday += 1;
  }

  const lapsed = await pool.query(
    `SELECT u.id, u.name FROM users u
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'delivered')
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.created_at > NOW() - make_interval(days => $1))`,
    [WINBACK_AFTER_DAYS]
  );
  for (const u of lapsed.rows) {
    const sent = await sendOffer(u, 'winback', {
      prefix: 'MISSYOU', percent: WINBACK_PERCENT, now,
      title: 'We saved something for you',
      body: `It has been a while. Enjoy ${WINBACK_PERCENT}% off your next order with code {code} within 14 days.`,
    });
    if (sent) result.winback += 1;
  }
  return result;
}

router.post('/run', auth, admin, async (req, res) => {
  try {
    res.json(await runCampaignSweep());
  } catch (e) {
    console.error('CAMPAIGN SWEEP FAILED:', e.message);
    res.status(500).json({ message: 'Could not run campaigns' });
  }
});

router.post('/cron-run', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured on the server' });
  if (req.headers['x-cron-secret'] !== secret) return res.status(401).json({ message: 'Invalid cron secret' });
  try {
    res.json(await runCampaignSweep());
  } catch (e) {
    console.error('CAMPAIGN SWEEP FAILED:', e.message);
    res.status(500).json({ message: 'Could not run campaigns' });
  }
});

// Opt-in daily sweep for always-on deployments (ENABLE_CAMPAIGN_CRON=true).
export function startCampaignScheduler() {
  if (process.env.ENABLE_CAMPAIGN_CRON !== 'true') return;
  console.log('Campaign scheduler enabled: birthday and win-back offers once a day');
  setInterval(() => {
    runCampaignSweep().then((r) => (r.birthday || r.winback) && console.log('Campaign sweep:', r)).catch((e) => console.error('Campaign sweep failed:', e.message));
  }, 24 * 60 * 60 * 1000);
}

export default router;
