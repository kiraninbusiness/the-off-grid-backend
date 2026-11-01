export const MAX_REVIEW_PHOTOS = 3;

// Review photos must be files we stored ourselves (Cloudinary "the-off-grid" folder, or our own
// /uploads in development), so a customer cannot point a review at an arbitrary outside image.
export function isOwnedPhotoUrl(url, env = process.env) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return false; }
  if (u.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && u.protocol === 'http:')) return false;
  if (u.host === 'res.cloudinary.com' && u.pathname.includes('/the-off-grid/')) return true;
  const backend = String(env.BACKEND_URL || '').replace(/\/$/, '');
  return Boolean(backend) && String(url).startsWith(`${backend}/uploads/`);
}

/** Returns a clean list (max 3, unique, owned) or { error }. */
export function normalizePhotoUrls(input, env = process.env) {
  if (input === undefined) return { skip: true };
  if (!Array.isArray(input)) return { error: 'photos must be a list' };
  const out = [];
  for (const raw of input) {
    const url = String(raw ?? '').trim();
    if (!isOwnedPhotoUrl(url, env)) return { error: 'One of the photos was not uploaded through the app' };
    if (!out.includes(url)) out.push(url);
  }
  if (out.length > MAX_REVIEW_PHOTOS) return { error: `You can add up to ${MAX_REVIEW_PHOTOS} photos` };
  return { urls: out };
}
