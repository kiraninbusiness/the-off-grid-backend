import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, generateOtp, hashOtp, otpMatches } from '../src/services/otp.js';

test('Indian mobile numbers are normalised, others rejected', () => {
  assert.equal(normalizePhone('98765 43210'), '919876543210');
  assert.equal(normalizePhone('+91-98765-43210'), '919876543210');
  assert.equal(normalizePhone('09876543210'), '919876543210');
  assert.equal(normalizePhone('5876543210'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(null), null);
});

test('codes are 6 digits', () => {
  for (let i = 0; i < 50; i++) assert.match(generateOtp(), /^\d{6}$/);
});

test('a code only matches its own phone and secret', () => {
  const h = hashOtp('919876543210', '123456', 's3cret');
  assert.equal(otpMatches('919876543210', '123456', h, 's3cret'), true);
  assert.equal(otpMatches('919876543210', '123457', h, 's3cret'), false);
  assert.equal(otpMatches('919999999999', '123456', h, 's3cret'), false);
  assert.equal(otpMatches('919876543210', '123456', h, 'other'), false);
  assert.equal(otpMatches('919876543210', 'abcdef', h, 's3cret'), false);
  assert.equal(otpMatches('919876543210', '123456', 'zz', 's3cret'), false);
});
