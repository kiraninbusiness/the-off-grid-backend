// Premium experience helpers: gift packaging and gift ideas. Pure, no database access.

export const PACKAGING_FEE = 99;
export const GIFT_MESSAGE_MAX = 200;

/** Black members get premium packaging free; everyone else pays the fee. */
export function packagingFee(wanted, tierKey) {
  if (wanted !== true) return 0;
  return tierKey === 'black' ? 0 : PACKAGING_FEE;
}

export function cleanGiftMessage(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, GIFT_MESSAGE_MAX);
}

/**
 * Gift ideas within a budget: in stock, price at most the budget, favouring popular pieces and
 * prices close to the budget (a gift should feel like it is worth the amount).
 * `sold` maps product id to units sold.
 */
export function giftIdeas(products, sold = {}, { budget, forGender = 'any', n = 8 } = {}) {
  const cap = Number(budget);
  if (!Number.isFinite(cap) || cap <= 0) return [];
  const g = String(forGender).toLowerCase();
  const out = products
    .filter((p) => Number(p.stock) > 0 && Number(p.price) > 0 && Number(p.price) <= cap)
    .filter((p) => g === 'any' || ['unisex', g].includes(String(p.gender ?? '').toLowerCase()))
    .map((p) => {
      const closeness = Number(p.price) / cap; // 0..1
      const popularity = Math.min(Number(sold[p.id]) || 0, 20) / 20;
      return { p, score: popularity * 2 + closeness };
    })
    .sort((a, b) => b.score - a.score);
  return out.slice(0, n).map((x) => x.p);
}
