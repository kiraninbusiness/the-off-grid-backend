// Pure helpers for anonymous app analytics. Only counts of allow-listed events are kept:
// no account, device id, IP address or free-form properties are stored.
export const ALLOWED_EVENTS = [
  'app_opened', 'product_viewed', 'add_to_cart', 'add_to_wishlist',
  'checkout_started', 'search', 'size_finder_used', 'pincode_checked',
];

/** Returns the event name if it is allow-listed, otherwise null. */
export function normalizeEventName(body) {
  const name = body && typeof body === 'object' ? String(body.event ?? '').trim().toLowerCase() : '';
  return ALLOWED_EVENTS.includes(name) ? name : null;
}
