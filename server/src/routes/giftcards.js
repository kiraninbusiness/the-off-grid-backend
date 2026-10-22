import { Router } from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { pool } from '../db.js';
import { auth, admin } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';

const router = Router();

const AMOUNTS = [500, 1000, 2000, 5000];

function generateCode() {
  return 'OG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

export function giftCardEmail(card) {
  return {
    subject: 'Your THE OFF GRID gift card',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <div style="background:#111;color:#fff;padding:20px 24px;letter-spacing:1px"><strong>THE OFF GRID</strong></div>
        <div style="padding:24px;border:1px solid #eee;border-top:none">
          <h2 style="margin-top:0">You've received a gift card${card.recipient_name ? `, ${card.recipient_name}` : ''}!</h2>
          ${card.message ? `<p><em>"${card.message}"</em></p>` : ''}
          <p style="font-size:28px;letter-spacing:2px;background:#f5f5f5;padding:16px;text-align:center"><strong>${card.code}</strong></p>
          <p>Value: ₹${card.initial_value}</p>
          <p>Use this code at checkout on theoffgrid.in</p>
        </div>
      </div>
    `
  };
}

// GET /api/gift-cards/amounts — public, the denominations sold on the storefront
router.get('/amounts', (req, res) => res.json(AMOUNTS));

/*
  POST /api/gift-cards/purchase
  ------------------------------------------------------------------
  P0 FIX: this used to create and immediately email an active gift
  card with no payment step at all — anyone could mint a real ₹5,000
  gift card for free. It now only creates a Razorpay order and a
  PENDING (inactive, zero-balance) gift card row. The card is not
  activated, credited, or emailed until /verify-payment confirms a
  real payment against that exact Razorpay order, using the same
  HMAC-signature verification pattern as regular order payments.
  ------------------------------------------------------------------
*/
router.post('/purchase', auth, async (req, res) => {
  const { amount, recipient_email, recipient_name = '', message = '' } = req.body;

  if (!AMOUNTS.includes(Number(amount))) {
    return res.status(400).json({ message: `Gift card amount must be one of ₹${AMOUNTS.join(', ₹')}` });
  }
  if (!/^\S+@\S+\.\S+$/.test(String(recipient_email || ''))) {
    return res.status(400).json({ message: 'A valid recipient email is required' });
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Online payment is not configured yet' });
  }

  try {
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const code = generateCode();
    const rOrder = await rzp.orders.create({
      amount: Number(amount) * 100,
      currency: 'INR',
      receipt: `giftcard_${code}`
    });

    const { rows } = await pool.query(
      `INSERT INTO gift_cards
        (code, initial_value, balance, purchased_by, recipient_email, recipient_name, message,
         active, payment_status, razorpay_order_id)
       VALUES ($1,$2,0,$3,$4,$5,$6, FALSE, 'pending', $7)
       RETURNING *`,
      [
        code, Number(amount), req.user.id,
        recipient_email.trim().toLowerCase(), recipient_name.trim().slice(0, 100), message.trim().slice(0, 300),
        rOrder.id
      ]
    );

    res.status(201).json({
      giftCardId: rows[0].id,
      razorpay_order_id: rOrder.id,
      amount: Number(amount),
      currency: 'INR',
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (e) {
    console.error('GIFT CARD PURCHASE ERROR:', e.message);
    res.status(500).json({ message: 'Could not start gift card purchase' });
  }
});

/*
  POST /api/gift-cards/verify-payment
  Activates the pending gift card — signature-verified, exactly like
  order payment verification. Only after this succeeds does the card
  get a real balance and get emailed to the recipient.
*/
router.post('/verify-payment', auth, async (req, res) => {
  const { giftCardId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Razorpay is not configured' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM gift_cards WHERE id = $1 AND purchased_by = $2 FOR UPDATE`,
      [giftCardId, req.user.id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Gift card order not found' });
    }

    const card = rows[0];

    if (card.payment_status === 'paid') {
      await client.query('COMMIT');
      return res.json(card);
    }

    if (card.razorpay_order_id !== razorpay_order_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Razorpay order mismatch' });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const providedSignature = String(razorpay_signature || '');
    const signaturesMatch =
      providedSignature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));

    if (!signaturesMatch) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const updated = await client.query(
      `UPDATE gift_cards
       SET balance = initial_value, active = TRUE, payment_status = 'paid', razorpay_payment_id = $2
       WHERE id = $1 AND payment_status <> 'paid'
       RETURNING *`,
      [giftCardId, razorpay_payment_id]
    );

    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Gift card could not be activated' });
    }

    await client.query('COMMIT');

    const finalCard = updated.rows[0];
    const { subject, html } = giftCardEmail(finalCard);
    sendEmail({ to: finalCard.recipient_email, subject, html }).catch(() => {});

    res.json(finalCard);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('GIFT CARD VERIFY ERROR:', e.message);
    res.status(500).json({ message: 'Could not verify gift card payment' });
  } finally {
    client.release();
  }
});

// GET /api/gift-cards/mine — gift cards this user has purchased (paid only)
router.get('/mine', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM gift_cards WHERE purchased_by = $1 AND payment_status = 'paid' ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/gift-cards/check — validate a code + see remaining balance (used at checkout)
router.post('/check', auth, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const { rows } = await pool.query(
    `SELECT id, code, balance, active, expires_at FROM gift_cards WHERE code = $1 AND payment_status = 'paid'`,
    [code]
  );
  const card = rows[0];

  if (!card) return res.status(404).json({ message: 'Gift card not found' });
  if (!card.active) return res.status(400).json({ message: 'This gift card is no longer active' });
  if (card.expires_at && new Date(card.expires_at) < new Date()) {
    return res.status(400).json({ message: 'This gift card has expired' });
  }
  if (card.balance <= 0) return res.status(400).json({ message: 'This gift card has no remaining balance' });

  res.json({ code: card.code, balance: card.balance });
});

// GET /api/admin/gift-cards — admin: list all gift cards (including abandoned/unpaid attempts)
router.get('/', auth, admin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM gift_cards ORDER BY created_at DESC');
  res.json(rows);
});

// POST /api/gift-cards/:id/resend — admin: resend the code (e.g. original email bounced/was lost)
router.post('/:id/resend', auth, admin, async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE gift_cards SET resent_count = resent_count + 1 WHERE id = $1 AND payment_status = 'paid' RETURNING *",
    [req.params.id]
  );
  const card = rows[0];
  if (!card) return res.status(404).json({ message: 'Paid gift card not found' });

  const { subject, html } = giftCardEmail(card);
  try {
    await sendEmail({ to: card.recipient_email, subject, html });
  } catch (e) {
    console.error('GIFT CARD RESEND FAILED:', e.message);
    return res.status(500).json({ message: 'Could not resend email' });
  }

  res.json(card);
});

export default router;
