# THE OFF GRID — Round 2 build notes

## Fixed bugs
- `orders.js` PATCH `/:id/status` referenced an undefined `client` variable
  and would have crashed in production. Fixed and wrapped in a proper
  transaction, and it now also stamps `delivered_at` the first time an
  order is marked delivered.

## New: transactional email system
`server/src/services/email.js` — SMTP-based (works with Gmail app
password, Resend, SendGrid, Brevo, Zoho, etc). Configure via env vars:

    SMTP_HOST=smtp.resend.com
    SMTP_PORT=587
    SMTP_USER=resend
    SMTP_PASS=your_api_key
    SMTP_FROM="THE OFF GRID <orders@theoffgrid.in>"

If SMTP_HOST is not set, emails print to the server console instead of
sending — nothing breaks in dev without a provider configured.

Wired into: password reset, order confirmation, order status change
(shipped/delivered/cancelled), back-in-stock alerts, return/exchange
status updates.

## New: password reset (was half-built)
- `client/src/pages/ResetPassword.jsx` — was missing entirely.
- `/auth/forgot-password` now actually emails the reset link instead of
  only printing it to server logs.

## New: checkout uses saved addresses
Checkout now loads the customer's saved addresses and shows them as
selectable cards, defaulting to their default address. "Use a different
address" reveals the manual form. Loyalty points redemption was also
added to checkout (was backend-only before).

## New: returns / exchanges
- DB table `returns` (already scaffolded, now fully wired).
- Customer: request return or exchange from a delivered order within a
  10-day window (`POST /api/returns`), see status on Orders and Account
  pages (`GET /api/returns/mine`).
- Admin: `AdminExtras` component — approve/reject/mark received/refunded/
  exchanged, with an admin note that emails the customer.

## New: SKU-level inventory
`product_variants` table (size + color -> stock) now actually used:
- Order placement checks and decrements variant stock when a variant
  exists for the item's size/color; falls back to product-level stock
  for products without variants (fully backward compatible).
- Cancellation restores variant stock.
- Admin: `PUT /api/products/:id/variants` to set the full variant grid,
  `PATCH .../variants/:variantId` to update one SKU (triggers back-in-
  stock emails automatically when a variant goes from 0 to available).

## New: admin tools
`server/src/routes/admin.js` + `client/src/components/AdminExtras.jsx`:
- Customer list with order count / lifetime spend / loyalty points /
  referral count, expandable to recent orders + saved addresses.
- Review moderation — hide/unhide/delete.
- Stock-alert dashboard — who's waiting on which product.
- Returns queue (see above).

## Intentionally not built this round
- Server-side cart/wishlist (currently localStorage) — fine at current
  traffic, revisit if multi-device cart sync becomes a real request.
- Product pagination — catalogue is 12 items; revisit past ~100.
- Image upload to a CDN — needs your own S3/Cloudinary credentials first.
