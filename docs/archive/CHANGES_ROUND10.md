# THE OFF GRID — Round 10: six new features

## 1. In-app notification center
- New `notifications` table + `/api/notifications` routes (list, unread
  count, mark read/read-all).
- Bell icon in the header with an unread badge, polling every 60s.
  Fires notifications alongside existing emails for: order status
  changes, return/exchange status changes, refunds processed,
  replacement shipment tracking, back-in-stock alerts, price drops,
  and abandoned-cart stage emails.

## 2. Wishlist price-drop notifications
- `wishlist_items.last_known_price` records the price at the moment
  something is wishlisted.
- Admin price edits that lower a product's price now email + notify
  everyone whose saved price was higher, then update their baseline —
  so the next real drop below *that* new price triggers again, rather
  than firing on every price change regardless of direction.

## 3. Order modification before shipping
- `PATCH /orders/:id/address` — edit delivery details.
- `PATCH /orders/:id/items/:itemId` — change size and/or quantity,
  with proper stock release/re-reservation and total recalculation.
- `DELETE /orders/:id/items/:itemId` — remove one line item (blocked
  if it's the only item — cancel the order instead).
- All three gated to `pending`/`processing` orders only; once shipped,
  it's a return/exchange instead.
- Orders page now has "CHANGE ADDRESS" and per-item "EDIT" controls.

## 4. Separate replacement order system
Confirmed already built from an earlier pass: marking an exchange
"exchanged" creates its own order row (`order_type:
'exchange_replacement'`) with its own ID and invoice, linked back to
the original return — rather than living only inside the return
record.

## 5. Staged abandoned-cart sequence
Confirmed already built: 30min → 6hr (+ product image) → 24hr (+
auto-generated 10%-off coupon) → 48hr (final reminder), tracked via
`cart_items.abandoned_stage`. Just needed the notifications router
mounted in `server.js` so its in-app notifications actually fire.

## 6. Rule-based "Find My Size"
- `client/src/utils/sizeFinder.js` — a straightforward height/weight/
  fit-preference lookup table, explicitly labeled as general guidance
  everywhere it's shown (not framed as AI/ML sizing, since a heuristic
  like this is necessarily approximate).
- New "FIND MY SIZE" modal on the product page next to Size Guide —
  snaps its recommendation to whatever sizes that specific product
  actually offers.

## Bug caught and fixed during this build
While wiring a notification call into `returns.js`, an earlier edit
accidentally deleted a closing brace. Caught immediately via a syntax
check before it went any further — worth mentioning since it's exactly
the kind of thing that would've silently broken deployment otherwise.

## Verified before packaging
- `vite build` — clean, no errors
- All server files pass `node --check`
- Full server import test — every route module loads and mounts
  correctly (only failure is the expected local Postgres connection
  refusal, confirming the app boots correctly right up to the DB)
