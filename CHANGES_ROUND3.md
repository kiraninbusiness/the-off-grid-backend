# THE OFF GRID — Round 3 build notes

Everything from the last gap-check except EMI/Pay Later (explicitly excluded).

## Variant admin UI (was backend-only last round)
- Admin > Inventory tab: expandable per-product size/color/stock grid,
  saves via `PUT /products/:id/variants`.
- `ProductDetails.jsx` now reads `product.variants`: disables sold-out
  sizes, shows "X left in M / Black", caps quantity to real stock.

## Video on PDP
- `products.video` column. Admin can set it via the existing product
  PATCH; gallery gets a video thumbnail/tab when present.

## Image/video upload
- `POST /api/upload` (multer, local disk, served at `/uploads/...`).
- ⚠️ Render's default disk is ephemeral — files vanish on redeploy/
  restart. Fine for testing; swap to Cloudinary/S3 before relying on
  this in production (only `upload.js` would need to change).

## Gift cards
- Purchase flow at `/gift-cards` (pick amount, recipient email,
  message) — emails the code to the recipient.
- Redeemable at checkout alongside coupon + points.
- Balance restored automatically if the order is cancelled.
- Admin > Gift Cards tab lists all cards issued.

## Combo / bundle deals
- Admin > Combo Deals tab: "any N from category X for ₹Y".
- Auto-applied at checkout — server picks whichever active deal saves
  the customer the most, computed from actual cart contents (not
  client-trusted).

## Server-side cart & wishlist
- `cart_items` / `wishlist_items` tables.
- Merges the guest (localStorage) cart/wishlist into the server copy
  once on login/register.
- Adds-to-bag and wishlist toggles sync to the server when logged in.
- Note: quantity changes and removals inside Checkout don't push to
  the server cart yet — only adds and wishlist toggles do. Good enough
  for cross-device "what did I add" continuity; full bidirectional
  sync would need every cart mutation routed through the API.

## Abandoned cart recovery
- `POST /api/admin/abandoned-carts/send` emails anyone whose
  server-side cart has sat idle 2+ hours and hasn't been emailed yet.
- No background job runner in this app, so this has to be triggered
  externally — either the "Send recovery emails now" button in
  Admin > Abandoned Carts, or a scheduled hit from Render Cron Jobs /
  GitHub Actions.

## WhatsApp support
- Floating WhatsApp button (bottom-left) linking to `wa.me`.
- ⚠️ Placeholder number (919999999999) — replace with your real
  WhatsApp Business number before launch.

## Lookbook / editorial page
- `/lookbook` — three editorial story blocks + a featured product grid.
  Linked from the footer.

## Pagination (backend only)
- `/api/products?page=1&limit=24` now returns `{items,total,page,pages}`.
  No `page` param = unchanged full-array response, which is what the
  storefront's client-side filtering currently depends on. Wiring this
  into the frontend properly means moving `ProductDiscovery` from
  client-side to server-side filtering — a bigger change, worth doing
  once the catalogue is large enough to matter (50–100+ products).
  Not done this round since it'd be pagination theater at 12 products.

## Not attempted, with reason
- AI/visual image search — needs a third-party ML API and ongoing
  cost; not something fakeable in a real build. Scope separately if
  you want to pursue it.
- EMI/Pay Later — excluded per your instruction.
