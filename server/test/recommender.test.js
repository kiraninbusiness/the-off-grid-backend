import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity, buildProfile, profileScore, rank } from '../src/services/recommender.js';

const p = (id, o = {}) => ({ id, category: 'Shirts', gender: 'Men', color: 'Black', fit: 'Oversized', price: 1000, stock: 5, created_at: '2026-01-01', ...o });

test('closer products score higher', () => {
  const base = p(1);
  assert.ok(similarity(base, p(2)) > similarity(base, p(3, { category: 'Jeans', color: 'Blue', price: 3000 })));
  assert.ok(similarity(base, p(2, { gender: 'Unisex' })) < similarity(base, p(2)));
});

test('similar list excludes itself and out-of-stock, and caps one category', () => {
  const base = p(1);
  const list = [p(1), p(2), p(3, { stock: 0 }), p(4), p(5), p(6), p(7, { category: 'Jeans' })];
  const out = rank(list, (c) => similarity(base, c), { exclude: new Set([1]), n: 8, maxPerCategory: 3 });
  assert.deepEqual(out.map((x) => x.id), [2, 4, 5, 7]);
});

test('profile favours what the customer bought and wishlisted', () => {
  const profile = buildProfile([p(1, { category: 'Jeans' })], [p(2, { category: 'Shirts' }), p(3, { category: 'Shirts' })]);
  assert.equal(profile.empty, false);
  const now = new Date('2026-06-01');
  assert.ok(profileScore(profile, p(9, { category: 'Shirts' }), now) > profileScore(profile, p(8, { category: 'Hoodies' }), now));
});

test('a new customer has an empty profile', () => {
  assert.equal(buildProfile([], []).empty, true);
});
