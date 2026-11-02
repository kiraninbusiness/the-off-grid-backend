import test from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, tierProgress, pointsForOrder, birthdayRewardDue, cleanBirthday } from '../src/services/club.js';

test('tiers follow lifetime spend', () => {
  assert.equal(tierFor(0).key, 'bronze');
  assert.equal(tierFor(4999).key, 'bronze');
  assert.equal(tierFor(5000).key, 'silver');
  assert.equal(tierFor(15000).key, 'gold');
  assert.equal(tierFor(99999).key, 'black');
  assert.equal(tierFor(-5).key, 'bronze');
  assert.equal(tierFor('abc').key, 'bronze');
});

test('progress shows what is left to the next tier', () => {
  const p = tierProgress(2500);
  assert.equal(p.next_tier, 'Silver');
  assert.equal(p.spend_to_next, 2500);
  assert.equal(p.percent_to_next, 50);
  const top = tierProgress(50000);
  assert.equal(top.next_tier, null);
  assert.equal(top.percent_to_next, 100);
});

test('tier multiplier adds bonus points on top of the base', () => {
  assert.deepEqual(pointsForOrder(2000, 0), { base: 20, bonus: 0, tier: 'bronze' });
  assert.deepEqual(pointsForOrder(2000, 5000), { base: 20, bonus: 5, tier: 'silver' });
  assert.deepEqual(pointsForOrder(2000, 15000), { base: 20, bonus: 10, tier: 'gold' });
  assert.deepEqual(pointsForOrder(2000, 40000), { base: 20, bonus: 20, tier: 'black' });
  assert.deepEqual(pointsForOrder(50, 40000), { base: 0, bonus: 0, tier: 'black' });
});

test('birthday reward is due in the birthday month, once a year', () => {
  const now = new Date(Date.UTC(2026, 10, 5));
  assert.equal(birthdayRewardDue('1995-11-20', null, now), true);
  assert.equal(birthdayRewardDue('1995-11-20', 2026, now), false);
  assert.equal(birthdayRewardDue('1995-11-20', 2025, now), true);
  assert.equal(birthdayRewardDue('1995-03-20', null, now), false);
  assert.equal(birthdayRewardDue(null, null, now), false);
});

test('birthdays must be real dates for a plausible age', () => {
  const now = new Date(Date.UTC(2026, 10, 5));
  assert.equal(cleanBirthday('1995-11-20', now), '1995-11-20');
  assert.equal(cleanBirthday('1995-02-30', now), null);
  assert.equal(cleanBirthday('2020-01-01', now), null);
  assert.equal(cleanBirthday('1800-01-01', now), null);
  assert.equal(cleanBirthday('nope', now), null);
});

import { meetsTier, earlyAccessInfo, isTierKey } from '../src/services/club.js';

test('tier gates for coupons', () => {
  assert.equal(meetsTier(0, null), true);
  assert.equal(meetsTier(0, 'silver'), false);
  assert.equal(meetsTier(5000, 'silver'), true);
  assert.equal(meetsTier(20000, 'silver'), true);
  assert.equal(meetsTier(20000, 'black'), false);
  assert.equal(isTierKey('gold'), true);
  assert.equal(isTierKey('platinum'), false);
});

test('early access locks the item only until the window ends', () => {
  const now = new Date(Date.UTC(2026, 10, 5));
  const p = { early_access_until: '2026-11-10T00:00:00Z', early_access_tier: 'gold' };
  assert.equal(earlyAccessInfo(p, 0, now).locked, true);
  assert.equal(earlyAccessInfo(p, 15000, now).locked, false);
  assert.equal(earlyAccessInfo(p, 0, new Date(Date.UTC(2026, 10, 11))).active, false);
  assert.equal(earlyAccessInfo({}, 0, now).active, false);
  assert.equal(earlyAccessInfo({ early_access_until: '2026-11-10T00:00:00Z' }, 5000, now).tier, 'gold');
});
