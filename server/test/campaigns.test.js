import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayPercent, periodKey, offerCode, offerExpiry } from '../src/services/campaigns.js';

test('higher tiers get a bigger birthday offer', () => {
  assert.equal(birthdayPercent('bronze'), 10);
  assert.equal(birthdayPercent('black'), 20);
  assert.equal(birthdayPercent('unknown'), 10);
});

test('period keys stop a customer being sent the same offer twice', () => {
  const a = new Date(Date.UTC(2026, 10, 2));
  const b = new Date(Date.UTC(2026, 10, 20));
  assert.equal(periodKey('birthday', a), '2026');
  assert.equal(periodKey('winback', a), periodKey('winback', b));
  assert.notEqual(periodKey('winback', new Date(Date.UTC(2026, 0, 5))), periodKey('winback', a));
});

test('offer codes are prefixed, uppercase and unique enough', () => {
  const c = offerCode('BDAY');
  assert.match(c, /^BDAY-[0-9A-F]{6}$/);
  assert.notEqual(offerCode('BDAY'), offerCode('BDAY'));
});

test('offers expire in 14 days', () => {
  const now = new Date(Date.UTC(2026, 10, 2));
  assert.equal(offerExpiry(now), '2026-11-16T00:00:00.000Z');
});
