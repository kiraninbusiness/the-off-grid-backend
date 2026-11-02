// OFF GRID CLUB: tiers, point multipliers and birthday rewards. Pure helpers, no database access.

// Tier is decided by lifetime spend on settled orders (rupees).
export const TIERS = [
  { key: 'bronze', name: 'Bronze', minSpend: 0, multiplier: 1, perks: ['1 point for every ₹100 spent', 'Birthday reward'] },
  { key: 'silver', name: 'Silver', minSpend: 5000, multiplier: 1.25, perks: ['1.25x points', 'Birthday reward', 'Silver-only coupons'] },
  { key: 'gold', name: 'Gold', minSpend: 15000, multiplier: 1.5, perks: ['1.5x points', 'Birthday reward', 'Gold-only coupons', 'Early access to new drops'] },
  { key: 'black', name: 'Black', minSpend: 40000, multiplier: 2, perks: ['2x points', 'Birthday reward', 'Black-only coupons', 'First access to every drop'] },
];

export const BIRTHDAY_POINTS = 200;

export function tierFor(spend) {
  const s = Math.max(0, Number(spend) || 0);
  let current = TIERS[0];
  for (const t of TIERS) if (s >= t.minSpend) current = t;
  return current;
}

export function tierRank(key) {
  const i = TIERS.findIndex((t) => t.key === key);
  return i < 0 ? 0 : i;
}

export function tierProgress(spend) {
  const s = Math.max(0, Number(spend) || 0);
  const current = tierFor(s);
  const next = TIERS[tierRank(current.key) + 1] || null;
  return {
    tier: current.key,
    name: current.name,
    multiplier: current.multiplier,
    perks: current.perks,
    spend: s,
    next_tier: next ? next.name : null,
    spend_to_next: next ? next.minSpend - s : 0,
    percent_to_next: next ? Math.min(100, Math.round(((s - current.minSpend) / (next.minSpend - current.minSpend)) * 100)) : 100,
  };
}

/** Base points (1 per ₹100) and the extra the member's tier adds on top. */
export function pointsForOrder(total, spendBefore) {
  const base = Math.floor((Number(total) || 0) / 100);
  const tier = tierFor(spendBefore);
  const bonus = Math.floor(base * tier.multiplier) - base;
  return { base, bonus: Math.max(0, bonus), tier: tier.key };
}

/** dob is 'YYYY-MM-DD'. Eligible during the birthday month, once per calendar year. */
export function birthdayRewardDue(dob, lastRewardYear, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob ?? '').slice(0, 10));
  if (!m) return false;
  if (Number(lastRewardYear) === now.getUTCFullYear()) return false;
  return Number(m[2]) === now.getUTCMonth() + 1;
}

/** Accepts a real past date for someone aged 13 to 110. Returns 'YYYY-MM-DD' or null. */
export function cleanBirthday(value, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const age = now.getUTCFullYear() - y - (now < new Date(Date.UTC(now.getUTCFullYear(), mo - 1, d)) ? 1 : 0);
  if (age < 13 || age > 110) return null;
  return m[0];
}

export function isTierKey(value) {
  return TIERS.some((t) => t.key === value);
}

/** True when a member with this spend may use something reserved for minTier and above. */
export function meetsTier(spend, minTier) {
  if (!minTier) return true;
  return tierRank(tierFor(spend).key) >= tierRank(minTier);
}

/** Early access: before the date everyone below the tier sees the item locked. */
export function earlyAccessInfo(product, spend, now = new Date()) {
  const until = product?.early_access_until ? new Date(product.early_access_until) : null;
  if (!until || Number.isNaN(until.getTime()) || until <= now) return { active: false, locked: false };
  const tier = isTierKey(product.early_access_tier) ? product.early_access_tier : 'gold';
  return { active: true, locked: !meetsTier(spend, tier), tier, until: until.toISOString() };
}
