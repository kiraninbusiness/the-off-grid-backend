# THE OFF GRID — Round 7 build notes

## Configuration reminders (not code — need your credentials)
- **SMTP**: without SMTP_HOST/PORT/USER/PASS/FROM set, all emails
  (order confirmation, shipping, password reset, returns, gift cards,
  abandoned cart, back-in-stock) print to the server console instead
  of sending. The code is correct — this is purely a "you haven't
  configured a provider yet" state. Fastest setup: Resend's free tier.
- **Cloudinary**: without CLOUDINARY_URL set, uploads still fall back
  to local disk, which doesn't survive a Render redeploy. Set this
  before uploading your real catalogue.

## Exchange: full replacement shipment lifecycle
Previously an exchange going to "exchanged" deducted the replacement
SKU but had no tracking beyond that single status label. Now:

- `returns` table tracks `replacement_status` (reserved → shipped →
  delivered), courier, AWB, and tracking URL.
- Marking an exchange "exchanged" automatically sets
  `replacement_status = 'reserved'`.
- New `PATCH /api/returns/:id/shipment` — admin sets courier/AWB/
  tracking URL and marks shipped/delivered. Each transition emails the
  customer with tracking details.
- Admin: Returns tab now shows a replacement-shipment block (courier/
  AWB/tracking inputs + Mark Shipped/Mark Delivered buttons) once an
  exchange is reserved.
- Customer: Account > Returns now shows replacement tracking info and
  a "Track Replacement" link once it ships.

This still isn't a fully independent replacement *order* record (no
separate order ID, its own line in Orders/invoicing) — it's tracked as
part of the return/exchange record instead. That's a reasonable scope
for a small catalogue; a full independent order-lifecycle clone would
make sense once you're doing enough exchange volume to need separate
fulfillment/invoicing for replacements specifically.
