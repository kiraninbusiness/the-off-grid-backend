import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOrderRequest, isValidOrderIdempotencyKey } from './orderIdempotency.js';

const base = {
  items: [{ productId: 12, quantity: 2, selectedSize: ' M ', selectedColor: ' Black ' }],
  shipping: { name: ' Test User ', phone: '9876543210', email: 'TEST@example.com', address: '1 Main St', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  payment_method: 'cod',
  redeem_points: 10,
  coupon_code: 'save10',
  gift_card_code: '',
  gift_wrap: false,
  gift_message: ''
};

test('accepts generated idempotency keys and rejects malformed keys', () => {
  assert.equal(isValidOrderIdempotencyKey('og-abc123-def456-ghi789'), true);
  assert.equal(isValidOrderIdempotencyKey('short'), false);
  assert.equal(isValidOrderIdempotencyKey('bad key with spaces'), false);
  assert.equal(isValidOrderIdempotencyKey('x'.repeat(129)), false);
});

test('hash is stable for semantically identical normalized order requests', () => {
  const equivalent = {
    ...base,
    items: [{ productId: '12', quantity: '2', selectedSize: 'M', selectedColor: 'Black' }],
    shipping: { ...base.shipping, name: 'Test User', email: 'test@example.com' },
    coupon_code: 'SAVE10'
  };
  assert.equal(hashOrderRequest(base), hashOrderRequest(equivalent));
});

test('hash changes when order contents or payment choice changes', () => {
  assert.notEqual(hashOrderRequest(base), hashOrderRequest({ ...base, items: [{ ...base.items[0], quantity: 1 }] }));
  assert.notEqual(hashOrderRequest(base), hashOrderRequest({ ...base, payment_method: 'online' }));
});
