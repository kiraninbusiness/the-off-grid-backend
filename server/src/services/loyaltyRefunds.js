export function calculateRefundPointsReversal({ pointsEarned, orderTotal, cumulativeRefund, previouslyReversed }) {
  const earned = Math.max(0, Math.floor(Number(pointsEarned) || 0));
  const total = Number(orderTotal);
  const refunded = Math.max(0, Number(cumulativeRefund) || 0);
  const prior = Math.max(0, Math.floor(Number(previouslyReversed) || 0));
  if (!Number.isFinite(total) || total <= 0 || earned === 0) return 0;
  const target = Math.min(earned, Math.floor(earned * Math.min(refunded, total) / total));
  return Math.max(0, target - Math.min(prior, earned));
}
