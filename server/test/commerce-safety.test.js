import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MAX_CART_QUANTITY, isValidCartItem, normalizeMergeItems } from '../src/services/cartValidation.js';
import { verifyRazorpayWebhookSignature, webhookEventId } from '../src/services/webhookSecurity.js';

test('cart quantity validation enforces the shared maximum and safe integers', () => {
  assert.equal(MAX_CART_QUANTITY, 10);
  assert.equal(isValidCartItem(1, 1), true);
  assert.equal(isValidCartItem(1, 10), true);
  assert.equal(isValidCartItem(1, 11), false);
  assert.equal(isValidCartItem(1, 0), false);
  assert.equal(isValidCartItem(1, 1.5), false);
  assert.equal(isValidCartItem(0, 1), false);
  assert.equal(isValidCartItem(1, 1, 'x'.repeat(81), ''), false);
});

test('guest cart merge combines duplicate SKUs without exceeding the limit', () => {
  const merged = normalizeMergeItems([
    { id: 12, qty: 6, selectedSize: 'M', selectedColor: 'Black' },
    { id: 12, qty: 6, selectedSize: 'M', selectedColor: 'Black' },
    { id: 12, qty: 2, selectedSize: 'L', selectedColor: 'Black' }
  ]);
  assert.deepEqual(merged, [
    { id: 12, qty: 10, selectedSize: 'M', selectedColor: 'Black' },
    { id: 12, qty: 2, selectedSize: 'L', selectedColor: 'Black' }
  ]);
});

test('guest cart merge rejects malformed payloads and quantities', () => {
  assert.throws(() => normalizeMergeItems(null), error => error.status === 400);
  assert.throws(() => normalizeMergeItems([{ id: 1, qty: 11 }]), error => error.status === 400);
  assert.throws(() => normalizeMergeItems([{ id: -1, qty: 1 }]), error => error.status === 400);
});

test('Razorpay webhook signature accepts only the exact signed body', () => {
  const secret = 'test-webhook-secret';
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured', id: 'evt_test' }));
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyRazorpayWebhookSignature(body, signature, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(body, signature, 'wrong-secret'), false);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.from('tampered'), signature, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(body, 'not-a-signature', secret), false);
  assert.equal(verifyRazorpayWebhookSignature(body, signature, ''), false);
});

test('webhook event IDs are stable for retries and respect provider IDs', () => {
  const body = Buffer.from('same payload');
  assert.equal(webhookEventId(body, ' evt_123 '), 'evt_123');
  assert.equal(webhookEventId(body, null), crypto.createHash('sha256').update(body).digest('hex'));
  assert.equal(webhookEventId(body, 'x'.repeat(300)).length, 255);
});
