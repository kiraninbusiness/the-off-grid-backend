# Checkout redesign + cart drawer (matching supplied reference screenshots)

## What changed

**Checkout page layout was inverted from the reference.** Previously the
cart items sat in a plain left column with no totals or submit button,
while the entire interactive form (address + payment + coupon + gift
card + points + totals + the actual submit button) was crammed into the
right column. Restructured to match the reference exactly:
- **Left (main):** "CHECKOUT." heading, "01 — DELIVERY ADDRESS" (full
  name/phone side-by-side, address, city/state side-by-side, pincode),
  "02 — PAYMENT" (COD / Razorpay), then loyalty points if the customer
  has any.
- **Right (sticky sidebar):** "YOUR BAG" with line items, coupon code
  + gift card code fields, the order totals breakdown, and the actual
  "PLACE ORDER" button — using a `form="checkout-form"` attribute so
  the button can live in the sidebar while submitting the form in the
  main column (standard HTML, no JS wiring needed).
- Header simplified to "← KEEP SHOPPING" matching the reference.

All existing functionality (saved addresses, coupons, gift cards,
loyalty points, Razorpay) was preserved — only the layout changed, not
what it can do.

**Built the missing cart drawer.** There was no mini-cart at all —
clicking the bag icon or adding an item jumped straight to the full
`/checkout` page every time, with no way to glance at your bag and keep
browsing. Added `components/CartDrawer.jsx`: a right-side slide-out
panel with a free-shipping progress bar, per-item quantity controls,
subtotal, and "Proceed to Checkout" — matching the reference. Wired it
to open automatically when adding to bag (from the shop grid, product
detail page, or wishlist) and from the nav bag icon, replacing the old
"always jump straight to checkout" behavior.

## Not changed
Login/Register page and the order-tracking step layout were left as-is
for now — they're functionally solid, and reshaping those further would
be a separate, similarly-sized pass. Happy to do that next if wanted.

---
Verified with real syntax checking: genuine JSX compilation for every
client file, genuine ESM parsing for every server file, zero missing
imports. Zero failures.
