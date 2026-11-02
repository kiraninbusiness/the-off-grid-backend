import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRefundPointsReversal } from '../src/services/loyaltyRefunds.js';

test('refund reverses purchase points proportionally without exceeding earned points', () => {
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 100, orderTotal: 1000, cumulativeRefund: 250, previouslyReversed: 0 }), 25);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 100, orderTotal: 1000, cumulativeRefund: 1000, previouslyReversed: 25 }), 75);
});

test('multiple partial refunds reverse only the incremental points', () => {
  const first = calculateRefundPointsReversal({ pointsEarned: 99, orderTotal: 300, cumulativeRefund: 100, previouslyReversed: 0 });
  const second = calculateRefundPointsReversal({ pointsEarned: 99, orderTotal: 300, cumulativeRefund: 200, previouslyReversed: first });
  const third = calculateRefundPointsReversal({ pointsEarned: 99, orderTotal: 300, cumulativeRefund: 300, previouslyReversed: first + second });
  assert.deepEqual([first, second, third], [33, 33, 33]);
});

test('rounding, zero values and invalid totals are safe', () => {
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 1, orderTotal: 3, cumulativeRefund: 1, previouslyReversed: 0 }), 0);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 1, orderTotal: 3, cumulativeRefund: 2, previouslyReversed: 0 }), 0);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 1, orderTotal: 3, cumulativeRefund: 3, previouslyReversed: 0 }), 1);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 0, orderTotal: 100, cumulativeRefund: 100, previouslyReversed: 0 }), 0);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 100, orderTotal: 0, cumulativeRefund: 50, previouslyReversed: 0 }), 0);
  assert.equal(calculateRefundPointsReversal({ pointsEarned: 100, orderTotal: 100, cumulativeRefund: 100, previouslyReversed: 150 }), 0);
});
