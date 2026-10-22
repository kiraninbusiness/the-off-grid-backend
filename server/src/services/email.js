import nodemailer from 'nodemailer';

/*
  EMAIL SERVICE

  Works with any standard SMTP provider — Gmail (app password), Resend,
  SendGrid, Brevo, Zoho, etc. Configure via env vars:

    SMTP_HOST=smtp.resend.com
    SMTP_PORT=587
    SMTP_USER=resend
    SMTP_PASS=your_api_key
    SMTP_FROM="THE OFF GRID <orders@theoffgrid.in>"

  If SMTP_HOST is not set, emails are printed to the server console
  instead of sent — the app keeps working in dev without any email
  provider configured.
*/

let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();

  if (!t) {
    console.log('=================================');
    console.log('EMAIL (SMTP not configured — printed instead of sent)');
    console.log('TO:', to);
    console.log('SUBJECT:', subject);
    console.log((text || html || '').replace(/<[^>]+>/g, ' ').slice(0, 500));
    console.log('=================================');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'THE OFF GRID <no-reply@theoffgrid.in>',
      to,
      subject,
      html,
      text: text || undefined
    });
    return { sent: true };
  } catch (e) {
    console.error('EMAIL SEND FAILED:', e.message);
    return { sent: false, reason: e.message };
  }
}

const wrap = (title, body) => `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <div style="background:#111;color:#fff;padding:20px 24px;letter-spacing:1px">
      <strong>THE OFF GRID</strong>
    </div>
    <div style="padding:24px;border:1px solid #eee;border-top:none">
      <h2 style="margin-top:0">${title}</h2>
      ${body}
    </div>
    <p style="color:#999;font-size:12px;padding:16px 24px">
      THE OFF GRID — you're receiving this because of activity on your account.
    </p>
  </div>
`;

export function passwordResetEmail(resetLink) {
  return {
    subject: 'Reset your THE OFF GRID password',
    html: wrap('Reset your password', `
      <p>We received a request to reset your password. This link expires in 30 minutes.</p>
      <p><a href="${resetLink}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">RESET PASSWORD</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `)
  };
}

export function orderConfirmationEmail(order) {
  const items = (order.items || [])
    .map((i) => `<li>${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''} — ₹${i.price}</li>`)
    .join('');
  return {
    subject: `Order confirmed — OG${String(order.id).padStart(6, '0')}`,
    html: wrap('Order confirmed', `
      <p>Thanks for shopping with us. Your order <strong>OG${String(order.id).padStart(6, '0')}</strong> has been placed.</p>
      <ul>${items}</ul>
      <p><strong>Total: ₹${order.total}</strong></p>
      <p>Payment method: ${String(order.payment_method || 'COD').toUpperCase()}</p>
    `)
  };
}

export function orderStatusEmail(order) {
  const statusCopy = {
    processing: 'Your order is being processed.',
    shipped: 'Your order has shipped and is on its way.',
    delivered: 'Your order has been delivered. Enjoy!',
    cancelled: 'Your order has been cancelled.'
  };
  return {
    subject: `Order OG${String(order.id).padStart(6, '0')} — ${String(order.status || '').toUpperCase()}`,
    html: wrap(`Order ${String(order.status || '').toUpperCase()}`, `
      <p>${statusCopy[order.status] || 'Your order status has been updated.'}</p>
      <p>Order: <strong>OG${String(order.id).padStart(6, '0')}</strong></p>
    `)
  };
}

export function backInStockEmail(productName, productUrl, variantLabel = null) {
  const displayName = variantLabel ? `${productName} — ${variantLabel}` : productName;
  return {
    subject: `${displayName} is back in stock`,
    html: wrap('Back in stock', `
      <p><strong>${productName}</strong>${variantLabel ? ` in <strong>${variantLabel}</strong>` : ''} is back in stock — grab it before it sells out again.</p>
      <p><a href="${productUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">SHOP NOW</a></p>
    `)
  };
}

export function priceDropEmail(productName, oldPrice, newPrice, productUrl, productImage) {
  const percentOff = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
  return {
    subject: `🔥 Price drop — ${productName} is now ₹${newPrice}`,
    html: wrap('Price drop on your wishlist', `
      ${productImage ? `<img src="${productImage}" alt="${productName}" style="width:100%;max-width:300px;display:block;margin-bottom:16px" />` : ''}
      <p><strong>${productName}</strong> just dropped from <span style="text-decoration:line-through;color:#999">₹${oldPrice}</span> to <strong style="color:#e0521a">₹${newPrice}</strong> (${percentOff}% off).</p>
      <p><a href="${productUrl}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">SHOP NOW</a></p>
    `)
  };
}

export function returnStatusEmail(ret) {
  const statusCopy = {
    approved: 'Your request has been approved. Please ship the item back to us.',
    rejected: 'Your request could not be approved.',
    received: 'We have received your returned item and are processing it.',
    refunded: 'Your refund has been processed.',
    exchanged: 'Your exchange has been processed and will ship shortly.'
  };
  return {
    subject: `${ret.type === 'exchange' ? 'Exchange' : 'Return'} request update — order OG${String(ret.order_id).padStart(6, '0')}`,
    html: wrap(`${ret.type === 'exchange' ? 'Exchange' : 'Return'} ${ret.status}`, `
      <p>${statusCopy[ret.status] || 'Your request status has been updated.'}</p>
      ${ret.admin_notes ? `<p><em>${ret.admin_notes}</em></p>` : ''}
    `)
  };
}
