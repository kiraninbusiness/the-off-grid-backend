import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedPhotoUrl, normalizePhotoUrls } from '../src/services/reviewPhotos.js';

const prod = { NODE_ENV: 'production', BACKEND_URL: 'https://api.example.com' };

test('only our own stored photos are accepted', () => {
  assert.equal(isOwnedPhotoUrl('https://res.cloudinary.com/demo/image/upload/v1/the-off-grid/a.jpg', prod), true);
  assert.equal(isOwnedPhotoUrl('https://api.example.com/uploads/1-2.jpeg', prod), true);
  assert.equal(isOwnedPhotoUrl('https://evil.com/the-off-grid/a.jpg', prod), false);
  assert.equal(isOwnedPhotoUrl('https://res.cloudinary.com/demo/image/upload/other/a.jpg', prod), false);
  assert.equal(isOwnedPhotoUrl('http://api.example.com/uploads/a.jpg', prod), false);
  assert.equal(isOwnedPhotoUrl('javascript:alert(1)', prod), false);
  assert.equal(isOwnedPhotoUrl('', prod), false);
});

test('photo lists are validated, de-duplicated and capped at 3', () => {
  const ok = (n) => `https://res.cloudinary.com/demo/image/upload/the-off-grid/${n}.jpg`;
  assert.deepEqual(normalizePhotoUrls(undefined, prod), { skip: true });
  assert.deepEqual(normalizePhotoUrls([], prod), { urls: [] });
  assert.deepEqual(normalizePhotoUrls([ok(1), ok(1), ok(2)], prod).urls, [ok(1), ok(2)]);
  assert.ok(normalizePhotoUrls([ok(1), ok(2), ok(3), ok(4)], prod).error);
  assert.ok(normalizePhotoUrls('x', prod).error);
  assert.ok(normalizePhotoUrls(['https://evil.com/a.jpg'], prod).error);
});
