// Pure helpers for courier details on an order.
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, n);

/** Returns { courier, awb, tracking_url } with only the valid fields, or { error } for a bad link. */
export function normalizeShipment(body) {
  const b = body && typeof body === 'object' ? body : {};
  const out = {};
  const courier = clip(b.courier, 60);
  const awb = clip(b.awb, 60);
  const url = clip(b.tracking_url, 500);
  if (courier) out.courier = courier;
  if (awb) out.awb = awb;
  if (url) {
    let ok = false;
    try { ok = new URL(url).protocol === 'https:'; } catch { ok = false; }
    if (!ok) return { error: 'Tracking link must be a valid https:// URL' };
    out.tracking_url = url;
  }
  return out;
}
