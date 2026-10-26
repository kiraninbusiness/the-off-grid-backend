import crypto from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** Indian mobile numbers only. Returns "91XXXXXXXXXX" or null. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/[^\d]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Codes are stored only as a keyed hash, bound to the phone number.
export function hashOtp(phone, code, secret) {
  return crypto.createHmac('sha256', String(secret)).update(`${phone}:${code}`).digest('hex');
}

export function otpMatches(phone, code, expectedHash, secret) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return false;
  const a = Buffer.from(hashOtp(phone, String(code), secret), 'hex');
  const b = Buffer.from(String(expectedHash ?? ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const otpConfigured = () => Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);

/** Sends the code with MSG91's OTP API. The template must be DLT-approved and contain ##OTP##. */
export async function sendOtpSms(phone, code) {
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', process.env.MSG91_TEMPLATE_ID);
  url.searchParams.set('mobile', phone);
  url.searchParams.set('otp', code);
  url.searchParams.set('otp_expiry', String(Math.round(OTP_TTL_MS / 60000)));
  const res = await fetch(url, { method: 'POST', headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' }, body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.type === 'error') throw new Error(`SMS provider error: ${data.message || res.status}`);
}
