import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShipment } from '../src/services/shipment.js';

test('keeps only provided, cleaned shipment fields', () => {
  assert.deepEqual(normalizeShipment({ courier: '  Delhivery ', awb: '12345\n' }), { courier: 'Delhivery', awb: '12345' });
  assert.deepEqual(normalizeShipment({}), {});
  assert.deepEqual(normalizeShipment(null), {});
});

test('tracking link must be https', () => {
  assert.equal(normalizeShipment({ tracking_url: 'https://track.example.com/x?id=1' }).tracking_url, 'https://track.example.com/x?id=1');
  assert.ok(normalizeShipment({ tracking_url: 'http://insecure.example.com' }).error);
  assert.ok(normalizeShipment({ tracking_url: 'javascript:alert(1)' }).error);
  assert.ok(normalizeShipment({ tracking_url: 'not a url' }).error);
});
