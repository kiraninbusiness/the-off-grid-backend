import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';
import { createNotification } from '../services/notifications.js';

const router = Router();

/*
  STAGED ABANDONED-CART RECOVERY

  Four escalating touches instead of one generic email:
    Stage 1 — 30 min idle  : gentle reminder
    Stage 2 — 6 hours idle : reminder + product image
    Stage 3 — 24 hours idle: reminder + one-time 10% coupon
    Stage 4 — 48 hours idle: final reminder

  Each cart only ever advances one stage per sweep and only once it's
  been idle long enough for that stage — cart_items.abandoned_stage
  tracks how far a given cart has gotten (0 = nothing sent yet).

  Runs the same three ways as before: admin "Send Now" button, an
  external scheduler hitting /cron-send with a shared secret, or the
  optional in-process interval for always-on deployments.
*/

const STAGES = [
  { stage: 1, hours: 0.5 },
  { stage: 2, hours: 6 },
  { stage: 3, hours: 24 },
  { stage: 4, hours: 48 },
];

function emailShell(title, body) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#111;color:#fff;padding:20px 24px;letter-spacing:1px"><strong>THE OFF GRID</strong></div>
      <div style="padding:24px;border:1px solid #eee;border-top:none">
        <h2 style="margin-top:0">${title}</h2>
        ${body}
      </div>
    </div>
  `;
}

async function makeComebackCoupon() {
  const code = 'COMEBACK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  await pool.query(
    `INSERT INTO coupons (code, type, value, usage_limit, expires_at)
     VALUES ($1, 'percent', 10, 1, NOW() + interval '72 hours')`,
    [code]
  );
  return code;
}

async function stageEmail(stage, row, items, checkoutUrl) {
  const itemList = items.map((i) => `<li>${i.name}${i.selected_size ? ` - ${i.selected_size}` : ''} - Rs.${i.price}</li>`).join('');
  const firstImage = items.find((i) => i.image)?.image;
  const name = row.name ? `, ${row.name}` : '';

  if (stage === 1) {
    return {
      subject: 'Still thinking it over?',
      html: emailShell(`Still thinking it over${name}?`, `
        <p>These are still in your bag:</p>
        <ul>${itemList}</ul>
        <p><a href="${checkoutUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">COMPLETE YOUR ORDER</a></p>
      `)
    };
  }
  if (stage === 2) {
    return {
      subject: 'You left these behind',
      html: emailShell('You left these behind', `
        ${firstImage ? `<img src="${firstImage}" alt="" style="width:100%;max-width:300px;display:block;margin-bottom:16px" />` : ''}
        <ul>${itemList}</ul>
        <p><a href="${checkoutUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">COMPLETE YOUR ORDER</a></p>
      `)
    };
  }
  if (stage === 3) {
    const code = await makeComebackCoupon();
    return {
      subject: "Here's 10% off to complete your order",
      html: emailShell('On the house - 10% off', `
        <ul>${itemList}</ul>
        <p>Use code <strong>${code}</strong> at checkout for 10% off - valid for the next 72 hours.</p>
        <p><a href="${checkoutUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">COMPLETE YOUR ORDER</a></p>
      `)
    };
  }
  return {
    subject: 'Last call - your bag is waiting',
    html: emailShell('Last call', `
      <p>Your bag is still here, but we will not keep reminding you after this.</p>
      <ul>${itemList}</ul>
      <p><a href="${checkoutUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">COMPLETE YOUR ORDER</a></p>
    `)
  };
}

async function runAbandonedCartSweep() {
  let sent = 0;

  for (const { stage, hours } of STAGES) {
    const { rows: staleCarts } = await pool.query(
      `SELECT DISTINCT ci.user_id, u.email, u.name
       FROM cart_items ci
       JOIN users u ON u.id = ci.user_id
       WHERE ci.abandoned_stage = $1
         AND ci.updated_at < NOW() - ($2 || ' hours')::interval`,
      [stage - 1, hours]
    );

    for (const row of staleCarts) {
      const { rows: items } = await pool.query(
        `SELECT ci.id, p.name, p.price, p.image, ci.selected_size
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1 AND ci.abandoned_stage = $2`,
        [row.user_id, stage - 1]
      );
      if (!items.length) continue;

      const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout`;
      const { subject, html } = await stageEmail(stage, row, items, checkoutUrl);

      await sendEmail({ to: row.email, subject, html });
      await pool.query('UPDATE cart_items SET abandoned_stage = $1 WHERE user_id = $2 AND abandoned_stage = $3', [stage, row.user_id, stage - 1]);
      createNotification(row.user_id, {
        type: 'abandoned_cart',
        title: stage === 3 ? 'A 10% off code is waiting for you at checkout' : 'You left something in your bag',
        link: '/checkout'
      });
      sent += 1;
    }
  }

  return sent;
}

// Optional in-process scheduler for always-on deployments. Opt-in via
// env - off by default so it doesn't surprise anyone relying on the
// external-cron approach instead.
export function startAbandonedCartScheduler() {
  if (process.env.ENABLE_ABANDONED_CART_CRON !== 'true') return;
  const hours = Number(process.env.ABANDONED_CART_INTERVAL_HOURS) || 0.5;
  console.log(`Abandoned-cart scheduler enabled: sweeping every ${hours}h through the 30min/6hr/24hr/48hr sequence`);
  setInterval(() => {
    runAbandonedCartSweep()
      .then((sent) => sent && console.log(`Abandoned-cart sweep: ${sent} email(s) sent`))
      .catch((e) => console.error('Abandoned-cart sweep failed:', e.message));
  }, hours * 60 * 60 * 1000);
}

router.post('/send', auth, admin, async (req, res) => {
  const sent = await runAbandonedCartSweep();
  res.json({ emails_sent: sent });
});

/*
  POST /api/admin/abandoned-carts/cron-send
  For external schedulers - authenticated with a long-lived secret
  instead of a personal admin JWT. Set CRON_SECRET in your env and
  send it as the x-cron-secret header from Render Cron / GitHub
  Actions / etc. Run this at least every 30 minutes so stage 1 fires
  close to on time.
*/
router.post('/cron-send', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ message: 'CRON_SECRET is not configured on the server' });
  }
  const provided = req.headers['x-cron-secret'];
  if (provided !== secret) {
    return res.status(401).json({ message: 'Invalid cron secret' });
  }
  const sent = await runAbandonedCartSweep();
  res.json({ emails_sent: sent });
});

// GET /api/admin/abandoned-carts - preview who currently qualifies for their next stage
router.get('/', auth, admin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.name, u.email, ci.abandoned_stage, COUNT(ci.id)::int AS item_count, MAX(ci.updated_at) AS last_updated
    FROM cart_items ci
    JOIN users u ON u.id = ci.user_id
    WHERE ci.abandoned_stage < 4
    GROUP BY u.id, u.name, u.email, ci.abandoned_stage
    ORDER BY last_updated ASC
  `);
  res.json(rows);
});

export default router;
