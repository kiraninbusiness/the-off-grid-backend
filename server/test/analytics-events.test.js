import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEventName } from '../src/services/analyticsEvents.js';

test('only allow-listed events are accepted', () => {
  assert.equal(normalizeEventName({ event: 'app_opened' }), 'app_opened');
  assert.equal(normalizeEventName({ event: ' Add_To_Cart ' }), 'add_to_cart');
  assert.equal(normalizeEventName({ event: 'drop table' }), null);
  assert.equal(normalizeEventName({}), null);
  assert.equal(normalizeEventName(null), null);
});
