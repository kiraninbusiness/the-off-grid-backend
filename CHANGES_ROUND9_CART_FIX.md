# THE OFF GRID — Cart duplication fix

## Root cause (confirmed)
Postgres treats NULL as distinct from NULL in unique constraints. The
cart_items table's uniqueness check — (user_id, product_id,
selected_size, selected_color) — relied on ON CONFLICT to detect "this
item is already in the cart, just bump the quantity." But whenever
selected_color (or selected_size) was NULL — which is normal for a
product with no color variants, like the Graphic Tee in your
screenshot — ON CONFLICT silently never matched. Every single "add to
bag" click on that product inserted a brand new row instead of
incrementing the existing one. That's exactly the 16+ duplicate rows
you saw in the bag drawer, with quantities/prices that looked random
but were really just N separate 1-quantity-or-more rows for the same
item.

The same bug existed in the merge-on-login endpoint. On top of that, I
found a second, related risk: the frontend's merge-on-login effect had
no hard guard against firing more than once, and the merge logic is
additive server-side (adds guest cart quantity onto whatever's already
there) — so even after fixing the NULL issue, a second accidental
merge call would have doubled quantities instead of creating duplicate
rows. Fixed both.

## What changed
- **Data cleanup (runs automatically on next deploy)**: existing
  duplicate cart rows are detected, their quantities summed into one
  row, and the extras deleted. This runs once, safely, as part of the
  normal startup migration — no manual DB work needed.
- **Schema fix**: `selected_size` / `selected_color` on `cart_items`
  are now `NOT NULL DEFAULT ''` instead of nullable — this class of
  bug can't recur.
- **Code fix**: `PUT /api/cart/item` and `POST /api/cart/merge` now
  normalize missing size/color to `''` instead of passing `null`
  through to the query.
- **Frontend guard**: the guest-cart-merge-on-login effect now uses a
  ref to guarantee it only ever runs once per page load, regardless of
  how many times the surrounding effect re-fires.

## What I could not confirm
"Admin page UI is not proper" — I checked Admin.jsx, it builds clean,
and the Save Product button does exist just below where your
screenshot was cut off (mid description field). I couldn't find a
concrete bug from what's visible in the screenshot. If something specific
looks broken there, a screenshot scrolled further down (or of whatever
looks wrong) would help me fix the right thing instead of guessing.
