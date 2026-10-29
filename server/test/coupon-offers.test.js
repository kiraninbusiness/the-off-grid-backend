import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOffer, isOfferVisible } from '../src/services/couponOffers.js';

test('offers are described in plain words', () => {
  assert.equal(describeOffer({ type: 'percent', value: 10, max_discount: 300, min_order: 999 }), '10% OFF up to ₹300 on orders above ₹999');
  assert.equal(describeOffer({ type: 'flat', value: 150, max_discount: null, min_order: 0 }), '₹150 OFF');
  assert.equal(describeOffer({ type: 'percent', value: 20, max_discount: null, min_order: 0 }), '20% OFF');
});

test('only public, active, live coupons are visible', () => {
  const base = { is_public: true, active: true, expires_at: null, usage_limit: null, used_count: 0 };
  assert.equal(isOfferVisible(base), true);
  assert.equal(isOfferVisible({ ...base, is_public: false }), false);
  assert.equal(isOfferVisible({ ...base, active: false }), false);
  assert.equal(isOfferVisible({ ...base, expires_at: '2020-01-01' }), false);
  assert.equal(isOfferVisible({ ...base, usage_limit: 5, used_count: 5 }), false);
  assert.equal(isOfferVisible({ ...base, usage_limit: 5, used_count: 4 }), true);
});
