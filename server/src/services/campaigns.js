import crypto from 'node:crypto';

// Pure helpers for retention campaigns (birthday and win-back). No database access here.

export const WINBACK_AFTER_DAYS = 60;
export const OFFER_VALID_DAYS = 14;
const BIRTHDAY_PERCENT = { bronze: 10, silver: 12, gold: 15, black: 20 };
export const WINBACK_PERCENT = 10;

export function birthdayPercent(tierKey) {
  return BIRTHDAY_PERCENT[tierKey] || BIRTHDAY_PERCENT.bronze;
}

// One send per customer per period, so running the sweep many times never repeats an offer.
export function periodKey(kind, now = new Date()) {
  const year = now.getUTCFullYear();
  if (kind === 'birthday') return String(year);
  const dayOfYear = Math.floor((now - new Date(Date.UTC(year, 0, 1))) / 86400000);
  return `${year}-${Math.floor(dayOfYear / 90)}`; // win-back at most about every 90 days
}

export function offerCode(prefix, random = crypto.randomBytes(4)) {
  return `${prefix}-${Buffer.from(random).toString('hex').toUpperCase().slice(0, 6)}`;
}

export function offerExpiry(now = new Date(), days = OFFER_VALID_DAYS) {
  return new Date(now.getTime() + days * 86400000).toISOString();
}
