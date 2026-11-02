import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneFor, estimateDelivery } from '../src/services/deliveryEstimate.js';

test('zones come from the pincode prefix and bad pincodes are rejected', () => {
  assert.equal(zoneFor('560001').zone, 'metro');
  assert.equal(zoneFor('313001').zone, 'standard');
  assert.equal(zoneFor('781001').zone, 'remote');
  assert.equal(zoneFor('012345'), null);
  assert.equal(zoneFor('abc'), null);
  assert.equal(estimateDelivery('1234', new Date()), null);
});

test('an order before the cutoff on a working day starts that day', () => {
  // Mon 2 Nov 2026, 10:00 IST = 04:30 UTC. Metro: 2-4 working days -> Wed 4 to Fri 6.
  const e = estimateDelivery('560001', new Date('2026-11-02T04:30:00Z'));
  assert.equal(e.min_date, '2026-11-04');
  assert.equal(e.max_date, '2026-11-06');
  assert.equal(e.estimated_days, '2–4 business days');
});

test('an order after the cutoff starts the next working day', () => {
  // Mon 2 Nov 2026, 16:00 IST = 10:30 UTC -> starts Tue 3 Nov.
  const e = estimateDelivery('560001', new Date('2026-11-02T10:30:00Z'));
  assert.equal(e.min_date, '2026-11-05');
  assert.equal(e.max_date, '2026-11-07');
});

test('Sundays are skipped, both for the start and in transit', () => {
  // Sat 7 Nov 2026 evening IST -> start Mon 9 Nov (Sunday skipped). Metro min +2 -> Wed 11.
  const e = estimateDelivery('560001', new Date('2026-11-07T14:30:00Z'));
  assert.equal(e.min_date, '2026-11-11');
  // Sunday 8 Nov order starts Monday 9 Nov too.
  assert.equal(estimateDelivery('560001', new Date('2026-11-08T05:00:00Z')).min_date, '2026-11-11');
});

test('a shipped parcel counts transit days from the ship date', () => {
  const e = estimateDelivery('560001', new Date('2026-11-02T10:30:00Z'), { shipped: true });
  assert.equal(e.min_date, '2026-11-04');
});
