import crypto from 'crypto';

export function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !secret || !signature) return false;
  const provided = String(signature);
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(provided, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

export function webhookEventId(rawBody, headerEventId) {
  const supplied = String(headerEventId || '').trim();
  return (supplied || crypto.createHash('sha256').update(rawBody).digest('hex')).slice(0, 255);
}
