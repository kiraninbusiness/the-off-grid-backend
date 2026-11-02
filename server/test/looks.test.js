import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLook } from '../src/services/looks.js';

const ok = { title: ' Street fit ', image: 'https://example.com/a.jpg', product_ids: [3, 4, '5', 4] };

test('a valid look is cleaned', () => {
  const r = normalizeLook(ok);
  assert.equal(r.value.title, 'Street fit');
  assert.deepEqual(r.value.product_ids, [3, 4, 5]);
  assert.equal(r.value.active, true);
});

test('bad looks are rejected with a reason', () => {
  assert.ok(normalizeLook({ ...ok, title: ' ' }).error);
  assert.ok(normalizeLook({ ...ok, image: 'http://x.com/a.jpg' }).error);
  assert.ok(normalizeLook({ ...ok, product_ids: [1] }).error);
  assert.ok(normalizeLook({ ...ok, product_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] }).error);
  assert.ok(normalizeLook({ ...ok, product_ids: ['a', -1, 0] }).error);
  assert.ok(normalizeLook(null).error);
});
