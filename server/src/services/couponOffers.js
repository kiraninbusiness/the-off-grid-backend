// Turns a coupon row into the short text customers see in the app.
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function describeOffer(c) {
  const off = c.type === 'flat' ? `${inr(c.value)} OFF` : `${c.value}% OFF`;
  const cap = c.type !== 'flat' && c.max_discount != null ? ` up to ${inr(c.max_discount)}` : '';
  const min = Number(c.min_order) > 0 ? ` on orders above ${inr(c.min_order)}` : '';
  return `${off}${cap}${min}`;
}

/** Only active, unexpired, not-used-up coupons the admin chose to show. */
export function isOfferVisible(c, now = new Date()) {
  if (!c.is_public || !c.active) return false;
  if (c.expires_at && new Date(c.expires_at) < now) return false;
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return false;
  return true;
}
