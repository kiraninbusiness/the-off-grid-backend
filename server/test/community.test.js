import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePost, publicName } from '../src/services/community.js';

const env = { NODE_ENV: 'production', BACKEND_URL: 'https://api.example.com' };
const img = 'https://res.cloudinary.com/demo/image/upload/the-off-grid/a.jpg';

test('posts need one of our own stored photos', () => {
  assert.ok(normalizePost({ image: 'https://evil.com/a.jpg' }, env).error);
  assert.ok(normalizePost({}, env).error);
  const r = normalizePost({ image: img, caption: '  Sunday fit \u0007 ' }, env);
  assert.equal(r.value.caption, 'Sunday fit');
});

test('captions are capped', () => {
  assert.equal(normalizePost({ image: img, caption: 'x'.repeat(500) }, env).value.caption.length, 200);
});

test('public names hide the surname', () => {
  assert.equal(publicName('Kiran Mamadapur'), 'Kiran M.');
  assert.equal(publicName('Kiran'), 'Kiran');
  assert.equal(publicName('  '), 'OFF GRID MEMBER');
  assert.equal(publicName(null), 'OFF GRID MEMBER');
});
