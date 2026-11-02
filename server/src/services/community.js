import { isOwnedPhotoUrl } from './reviewPhotos.js';

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, n);

export const MAX_PENDING_POSTS = 5;

/** Returns { value } with a clean post, or { error }. */
export function normalizePost(body, env = process.env) {
  const b = body && typeof body === 'object' ? body : {};
  const image = clip(b.image, 500);
  if (!isOwnedPhotoUrl(image, env)) return { error: 'Please add a photo from your gallery' };
  return { value: { image, caption: clip(b.caption, 200) } };
}

/** Name shown publicly: first name and last initial only. */
export function publicName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'OFF GRID MEMBER';
  const first = parts[0].slice(0, 20);
  return parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}
