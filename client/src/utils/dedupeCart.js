/*
  DEDUPE CART

  Fixes browsers that already accumulated duplicate line items from
  the earlier cart bug (Postgres NULL-uniqueness issue, now fixed
  server-side — see cart.js/db.js). That server-side fix only cleaned
  up the *database*; it did nothing for carts already sitting in each
  customer's own browser localStorage, which is a completely separate
  store. This collapses those duplicates back into one line item per
  product/size/color combination, summing their quantities into a
  single sane number instead of the runaway total from before.

  It also caps any single line item's quantity and the cart's overall
  total — a legitimate customer essentially never adds 50+ of the same
  T-shirt, so a number that large is corrupted data from the bug, not
  real intent. Merging duplicate rows alone wouldn't fix that: summing
  quantities together still lands on the same inflated total, just
  spread across fewer rows. Capping actually brings the number back to
  something sane.

  Safe to run on every load — a cart with no duplicates and reasonable
  quantities passes through completely unchanged.
*/
const MAX_QTY_PER_LINE = 10;
const MAX_CART_TOTAL_QTY = 50;

export function dedupeCart(cart) {
  if (!Array.isArray(cart)) return [];

  const byKey = new Map();
  for (const item of cart) {
    if (!item || item.id === undefined) continue;
    const key = `${item.id}|${item.selectedSize || ""}|${item.selectedColor || ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty = Number(existing.qty || 1) + Number(item.qty || 1);
    } else {
      byKey.set(key, { ...item, qty: Number(item.qty || 1) });
    }
  }

  let items = Array.from(byKey.values()).map((item) => ({
    ...item,
    qty: Math.min(item.qty, MAX_QTY_PER_LINE),
  }));

  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  if (totalQty > MAX_CART_TOTAL_QTY) {
    // Corrupted beyond a sane single-order size — this is bug fallout,
    // not a real cart. Clear it rather than preserve a nonsense total.
    console.warn(`Cart had ${totalQty} total items — clearing as corrupted rather than preserving an inflated total.`);
    return [];
  }

  return items;
}
