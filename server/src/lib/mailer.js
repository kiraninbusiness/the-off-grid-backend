/*
  Transactional email utility.

  Reads SMTP credentials from env vars:
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

  Works with any SMTP provider (Resend, SendGrid, Brevo/Sendinblue,
  Mailgun, Gmail app password, etc) — just set the standard SMTP vars
  in your .env / Render / Vercel environment.

  If SMTP is not configured, emails are logged to the console instead
  of failing. This means the app keeps working in dev/test without
  crashing, and you can turn on real email delivery any time by
  setting the env vars — no code changes required.
*/
import nodemailer from 'nodemailer';

let transporter = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

const BRAND = 'THE OFF GRID';
const FROM = process.env.SMTP_FROM || `${BRAND} <no-reply@theoffgrid.in>`;

function wrap(bodyHtml) {
  return `
  <div style="background:#f2f1ec;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #1a1a1a;">
      <div style="background:#1a1a1a;color:#fff;padding:20px 24px;letter-spacing:2px;font-size:13px;font-weight:bold;">
        ${BRAND}
      </div>
      <div style="padding:28px 24px;color:#1a1a1a;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;color:#888;font-size:11px;border-top:1px solid #eee;">
        WEAR YOUR OWN PATH — this is an automated message from ${BRAND}.
      </div>
    </div>
  </div>`;
}

/**
 * Send an email. Never throws — logs and resolves so a failed email
 * never breaks a checkout, status update, or password reset.
 */
export async function sendMail({ to, subject, html, text }) {
  try {
    const t = getTransporter();
    if (!t) {
      if (!warned) {
        console.log('[mailer] SMTP not configured — emails will be logged only. Set SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_PORT to send real email.');
        warned = true;
      }
      console.log(`[mailer] (not sent — no SMTP configured) To: ${to} | Subject: ${subject}`);
      return { sent: false, reason: 'smtp_not_configured' };
    }
    await t.sendMail({ from: FROM, to, subject, html, text });
    return { sent: true };
  } catch (e) {
    console.error('[mailer] send failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

const money = (paise) => `₹${Number(paise || 0).toLocaleString('en-IN')}`;

export const emailTemplates = {
  passwordReset(resetLink) {
    return {
      subject: 'Reset your password',
      html: wrap(`
        <h2 style="margin-top:0;">RESET YOUR PASSWORD</h2>
        <p>We received a request to reset your password. This link expires in 30 minutes.</p>
        <p style="margin:24px 0;"><a href="${resetLink}" style="background:#e8542a;color:#fff;padding:12px 22px;text-decoration:none;letter-spacing:1px;font-size:13px;">RESET PASSWORD</a></p>
        <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
      `),
      text: `Reset your password: ${resetLink} (expires in 30 minutes)`
    };
  },
  orderConfirmed(order) {
    return {
      subject: `Order confirmed — OG${String(order.id).padStart(6, '0')}`,
      html: wrap(`
        <h2 style="margin-top:0;">ORDER CONFIRMED</h2>
        <p>Thanks for shopping with us. Your order <strong>OG${String(order.id).padStart(6, '0')}</strong> is confirmed.</p>
        <p><strong>Total:</strong> ${money(order.total)}<br/>
        <strong>Payment method:</strong> ${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</p>
        <p>We'll email you again once it ships.</p>
      `),
      text: `Order OG${String(order.id).padStart(6, '0')} confirmed. Total: ${money(order.total)}.`
    };
  },
  orderStatus(order, status) {
    const labels = {
      processing: ['Order is being processed', 'We\'re getting your order ready to ship.'],
      shipped: ['Your order has shipped', 'Your order is on its way to you.'],
      out_for_delivery: ['Out for delivery', 'Your order will arrive today.'],
      delivered: ['Order delivered', 'Your order has been delivered. We hope you love it.'],
      cancelled: ['Order cancelled', 'Your order has been cancelled.']
    };
    const [title, body] = labels[status] || [`Order ${status}`, `Your order status is now ${status}.`];
    return {
      subject: `${title} — OG${String(order.id).padStart(6, '0')}`,
      html: wrap(`
        <h2 style="margin-top:0;">${title.toUpperCase()}</h2>
        <p>${body}</p>
        <p><strong>Order:</strong> OG${String(order.id).padStart(6, '0')}</p>
      `),
      text: `${title} — OG${String(order.id).padStart(6, '0')}: ${body}`
    };
  },
  backInStock(productName, productUrl) {
    return {
      subject: `Back in stock: ${productName}`,
      html: wrap(`
        <h2 style="margin-top:0;">BACK IN STOCK</h2>
        <p><strong>${productName}</strong> is back in stock. Grab it before it sells out again.</p>
        <p style="margin:24px 0;"><a href="${productUrl}" style="background:#e8542a;color:#fff;padding:12px 22px;text-decoration:none;letter-spacing:1px;font-size:13px;">SHOP NOW</a></p>
      `),
      text: `${productName} is back in stock: ${productUrl}`
    };
  },
  returnStatus(ret, status) {
    const labels = {
      approved: 'Your return/exchange request has been approved.',
      rejected: 'Your return/exchange request could not be approved.',
      refunded: 'Your refund has been processed.',
      completed: 'Your return/exchange has been completed.'
    };
    return {
      subject: `Return request update — #${ret.id}`,
      html: wrap(`
        <h2 style="margin-top:0;">RETURN REQUEST UPDATE</h2>
        <p>${labels[status] || `Your return request status is now ${status}.`}</p>
        <p><strong>Request:</strong> #${ret.id} on order OG${String(ret.order_id).padStart(6, '0')}</p>
      `),
      text: labels[status] || `Return #${ret.id} status: ${status}`
    };
  }
};
