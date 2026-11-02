// Delivery date estimates from the pincode and the order time. Pure, no database access.
// Working days are Monday to Saturday; Sundays are skipped. Times are Indian Standard Time.

const IST_OFFSET_MS = 5.5 * 3600000;
export const DISPATCH_CUTOFF_HOUR = 14; // orders before 2 PM IST can go out the same working day

// Transit working days by region, from the first digits of the pincode.
const METRO = ['11', '40', '41', '56', '60', '70', '50', '38'];
const REMOTE = ['18', '19', '78', '79', '74', '75', '73', '67'];

export function zoneFor(pincode) {
  const p = String(pincode ?? '');
  if (!/^[1-9]\d{5}$/.test(p)) return null;
  if (METRO.includes(p.slice(0, 2))) return { zone: 'metro', min: 2, max: 4 };
  if (REMOTE.includes(p.slice(0, 2))) return { zone: 'remote', min: 6, max: 10 };
  return { zone: 'standard', min: 4, max: 7 };
}

// Moves a UTC-midnight "IST calendar day" forward by n working days.
function addWorkingDays(day, n) {
  const d = new Date(day.getTime());
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left -= 1;
  }
  return d;
}

function istDay(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

const fmt = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * from: when the parcel starts moving (order time, or ship time when `shipped`).
 * Returns null for an invalid pincode.
 */
export function estimateDelivery(pincode, from = new Date(), { shipped = false } = {}) {
  const zone = zoneFor(pincode);
  if (!zone) return null;
  const start = new Date(from);
  let day = istDay(start);
  if (!shipped) {
    const hour = new Date(start.getTime() + IST_OFFSET_MS).getUTCHours();
    if (day.getUTCDay() === 0) day = addWorkingDays(day, 1);
    else if (hour >= DISPATCH_CUTOFF_HOUR) day = addWorkingDays(day, 1);
  }
  const min = addWorkingDays(day, zone.min);
  const max = addWorkingDays(day, zone.max);
  return {
    zone: zone.zone,
    min_date: min.toISOString().slice(0, 10),
    max_date: max.toISOString().slice(0, 10),
    label: `${fmt(min)} – ${fmt(max)}`,
    estimated_days: `${zone.min}–${zone.max} business days`,
  };
}
