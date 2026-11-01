import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBanner, isSafeAppLink } from '../src/services/banners.js';

test('only in-app links are allowed', () => {
  for (const ok of ['/deals', '/product/12', '/(tabs)/shop', '/shop?cat=hoodies']) assert.equal(isSafeAppLink(ok), true, ok);
  for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', 'deals', '/a b']) assert.equal(isSafeAppLink(bad), false, bad);
});

test('banner needs an https image and defaults the rest', () => {
  assert.ok(normalizeBanner({}).error);
  assert.ok(normalizeBanner({ image: 'http://x.com/a.jpg' }).error);
  assert.ok(normalizeBanner({ image: 'https://x.com/a.jpg', link: 'https://evil.com' }).error);
  const v = normalizeBanner({ image: 'https://x.com/a.jpg', title: ' Sale ' }).value;
  assert.equal(v.title, 'Sale');
  assert.equal(v.cta, 'SHOP NOW');
  assert.equal(v.link, '/(tabs)/shop');
  assert.equal(v.active, true);
  assert.equal(normalizeBanner({ image: 'https://x.com/a.jpg', active: false }).value.active, false);
});
