const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, n);

// Links stay inside the app: "/product/12", "/deals", "/(tabs)/shop". No external or protocol links.
export function isSafeAppLink(link) {
  return /^\/(?!\/)[A-Za-z0-9/_\-()?=&.%]*$/.test(String(link ?? ''));
}

/** Returns { value } with a clean banner, or { error }. */
export function normalizeBanner(body) {
  const b = body && typeof body === 'object' ? body : {};
  const image = clip(b.image, 500);
  let ok = false;
  try { ok = new URL(image).protocol === 'https:'; } catch { ok = false; }
  if (!ok) return { error: 'A banner image (https link) is required' };
  const link = clip(b.link, 200);
  if (link && !isSafeAppLink(link)) return { error: 'Link must be a page inside the app, for example /product/12 or /deals' };
  const sort = Number.parseInt(b.sort_order, 10);
  return {
    value: {
      image,
      kicker: clip(b.kicker, 60),
      title: clip(b.title, 80),
      copy: clip(b.copy, 120),
      cta: clip(b.cta, 30) || 'SHOP NOW',
      link: link || '/(tabs)/shop',
      sort_order: Number.isFinite(sort) ? Math.max(0, Math.min(999, sort)) : 0,
      active: b.active !== false,
    },
  };
}
