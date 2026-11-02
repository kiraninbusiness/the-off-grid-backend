const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, n);

import { isTierKey } from './club.js';

export const MAX_LOOK_PRODUCTS = 8;

/** Returns { value } with a clean look, or { error }. */
export function normalizeLook(body) {
  const b = body && typeof body === 'object' ? body : {};
  const title = clip(b.title, 80);
  if (!title) return { error: 'A look needs a title' };
  const image = clip(b.image, 500);
  let ok = false;
  try { ok = new URL(image).protocol === 'https:'; } catch { ok = false; }
  if (!ok) return { error: 'A cover photo (https link) is required' };
  const ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length < 2) return { error: 'Pick at least 2 products for a look' };
  if (ids.length > MAX_LOOK_PRODUCTS) return { error: `A look can have up to ${MAX_LOOK_PRODUCTS} products` };
  const sort = Number.parseInt(b.sort_order, 10);
  return {
    value: {
      title,
      image,
      description: clip(b.description, 300),
      creator: clip(b.creator, 60),
      product_ids: ids,
      sort_order: Number.isFinite(sort) ? Math.max(0, Math.min(999, sort)) : 0,
      active: b.active !== false,
      min_tier: isTierKey(b.min_tier) ? b.min_tier : null,
    },
  };
}
