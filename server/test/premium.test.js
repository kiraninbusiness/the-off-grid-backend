import test from 'node:test';
import assert from 'node:assert/strict';
import { packagingFee, cleanGiftMessage, giftIdeas } from '../src/services/premium.js';

test('premium packaging costs 99, free for Black members, nothing if not wanted', () => {
  assert.equal(packagingFee(true, 'bronze'), 99);
  assert.equal(packagingFee(true, 'gold'), 99);
  assert.equal(packagingFee(true, 'black'), 0);
  assert.equal(packagingFee(false, 'bronze'), 0);
  assert.equal(packagingFee('true', 'bronze'), 0); // only a real boolean counts
});

test('gift messages are cleaned and capped', () => {
  assert.equal(cleanGiftMessage('  Happy birthday \u0007! '), 'Happy birthday !');
  assert.equal(cleanGiftMessage('x'.repeat(500)).length, 200);
  assert.equal(cleanGiftMessage(null), '');
});

test('gift ideas stay inside the budget, in stock and for the right gender', () => {
  const list = [
    { id: 1, price: 999, stock: 3, gender: 'Men' },
    { id: 2, price: 1800, stock: 3, gender: 'Women' },
    { id: 3, price: 1900, stock: 0, gender: 'Men' },
    { id: 4, price: 2500, stock: 3, gender: 'Men' },
    { id: 5, price: 1500, stock: 3, gender: 'Unisex' },
  ];
  assert.deepEqual(giftIdeas(list, {}, { budget: 2000, forGender: 'men' }).map((p) => p.id), [5, 1]);
  assert.deepEqual(giftIdeas(list, {}, { budget: 2000 }).map((p) => p.id), [2, 5, 1]);
  assert.deepEqual(giftIdeas(list, {}, { budget: 0 }), []);
  assert.equal(giftIdeas(list, { 1: 20 }, { budget: 2000, forGender: 'men' })[0].id, 1);
});
