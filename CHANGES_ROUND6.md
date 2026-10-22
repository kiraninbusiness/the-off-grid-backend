# THE OFF GRID — Round 6 build notes

Covers both audit documents in this conversation: the webhook/refund/
exchange gaps, and the follow-up list (admin UI completeness, SEO-adjacent
messaging fix, profile/account deletion, analytics).

## P0 / Critical
- **Webhook reconciliation completed**: `payment.captured` catch-up now
  awards loyalty points and emails gift card recipients (not just flips
  a status flag). `payment.failed` now fully restores stock/points/
  coupon/gift-card balance and cancels the order — mirrors the existing
  cancel/payment-cancel flow exactly instead of leaving things half-done.
- **Exchange fulfillment automated**: marking an exchange `exchanged`
  locks and deducts the replacement SKU, and **refuses the status
  change** if that size/color isn't in stock — no more "exchanged"
  labels with nothing to actually ship.
- **Return-received auto-restock**: marking a return `received` restocks
  the correct SKU, logs it to the inventory ledger, and triggers
  back-in-stock notifications automatically.
- **Cloudinary support**: set `CLOUDINARY_URL` and uploads go straight to
  Cloudinary (CDN, survives deploys). Falls back to local disk — which
  is still ephemeral on Render — when not configured. No frontend
  changes needed to switch later.

## Admin UI catch-up (backend was ahead of the UI)
- Product form: material, care instructions, model details, video URL,
  SEO title, meta description — all now have actual input fields, not
  just backend columns.
- Real file upload buttons (images + video) using the new `apiUpload()`
  helper — no more URL-pasting-only.
- Variant editor: SKU, barcode, and cost price fields added alongside
  size/color/stock.
- New "Inventory History" view per product — the stock ledger the
  backend already tracked now has somewhere to actually look at it.
- New "Messages" tab — the Contact Us inbox backend existed but wasn't
  surfaced in AdminExtras until now.
- New "Analytics" tab — revenue (today/week/month/year), AOV, order
  count, bestsellers, best size/colour, low stock, repeat customer rate.
- Gift cards: resend button for when the original email bounces/gets lost.
- Refund button confirmed already wired (was flagged as missing —
  checked and it was actually already built correctly, including the
  "use Issue Refund instead" guard on paid online orders).

## SKU-level stock alerts
"Notify me" now captures size/color. Restocking one SKU only emails
people waiting on that SKU (or people who didn't specify a size at
all) — not everyone waiting on any size of the product.

## Customer account
- `PATCH /api/auth/me` — edit name/email, change password (requires
  current password).
- `DELETE /api/auth/me` — self-service account deletion, password-
  confirmed. Orders are kept (disconnected, not deleted) for accounting
  records; addresses/wishlist/cart/reviews are removed. This closes the
  gap where the Privacy Policy promised self-service deletion that
  didn't actually exist yet.

## Messaging fix
Topbar said "INDIA / WORLDWIDE" while checkout only accepts Indian
phone numbers, 6-digit pincodes, and INR/Razorpay. Changed to "SHIPPING
ACROSS INDIA" to match what the store actually does. If international
is a real near-term goal, that's a separate, bigger build (currency,
international address format, customs/duties) — not something to fake
with a copy change alone.

## Confirmed already solid (audited, no changes needed)
- Abandoned-cart cron: `CRON_SECRET` + dedicated `/cron-send` endpoint
  already exists — no admin JWT needed for the external scheduler.

## Still not built, with reasons (unchanged from before)
- **Courier integration** (Shiprocket/Delhivery/AWB tracking) — needs
  your real courier account credentials to build and test against.
- **GST/tax invoicing** — deliberately not fabricated without your
  actual GSTIN, registered state, and applicable rate. Building this
  wrong is worse than not building it.
- **International shipping** — real currency/customs/duties support,
  not just messaging. Separate project if you want to pursue it.
- Loyalty tiers, notification center, admin audit log, smarter
  recommendations — all explicitly flagged as not needed for launch
  in your own audit notes.
