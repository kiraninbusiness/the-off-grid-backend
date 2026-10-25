export const MAX_CART_QUANTITY = 10;

export function isValidCartItem(productId, quantity, selectedSize = '', selectedColor = '') {
  return Number.isSafeInteger(productId) && productId > 0 &&
    Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_QUANTITY &&
    String(selectedSize).trim().length <= 80 && String(selectedColor).trim().length <= 80;
}

export function normalizeMergeItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    throw Object.assign(new Error('Cart items must be provided as a list.'), { status: 400 });
  }
  const combined = new Map();
  for (const raw of rawItems) {
    const id = Number(raw?.id);
    const qty = Number(raw?.qty);
    const selectedSize = String(raw?.selectedSize || '').trim();
    const selectedColor = String(raw?.selectedColor || '').trim();
    if (!isValidCartItem(id, qty, selectedSize, selectedColor)) {
      throw Object.assign(new Error('The guest bag contains an invalid product, variant, or quantity.'), { status: 400 });
    }
    const key = JSON.stringify([id, selectedSize, selectedColor]);
    const prior = combined.get(key);
    combined.set(key, {
      id,
      qty: Math.min(MAX_CART_QUANTITY, (prior?.qty || 0) + qty),
      selectedSize,
      selectedColor
    });
  }
  return [...combined.values()];
}
