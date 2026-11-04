# THE OFF GRID — Two new products + real per-product size charts

## New products (seeded automatically on next deploy)
- **NIGHTGUARD PADDED JACKET** — ₹4,999 (was ₹5,999), sizes M/L/XL/XXL
- **SHIELD WINDCHEATER** — ₹3,499 (was ₹3,999), sizes M/L/XL/XXL

Both category JACKETS, 3 images each (free-to-use Unsplash photography
matching your dark streetwear aesthetic — swap via Admin whenever you
have real product photography shot).

**Important**: the seed check that adds these only runs if a product
with that exact name doesn't already exist — safe to deploy without
duplicating anything, and safe to re-run. Unlike the original seed
data (which only inserts once, when the products table is completely
empty), this specifically checks by name every startup, so it reaches
your live database even though it already has products in it.

## Size chart — was generic, now real per-product data
Every product's size guide used to show identical hardcoded inches-only
numbers regardless of what the product actually was. Now:
- New `products.size_chart` field (chest/length/shoulder in cm, per
  size) — set for both new products using exactly the measurements
  from your reference images
- Size guide modal now has a **CM / INCHES toggle** — inches are
  computed automatically from the cm values you enter (1 cm = 0.3937"),
  so you only ever maintain one set of numbers
- Products without a custom chart set still show the old generic
  fallback — nothing breaks for your existing catalog

## Admin: edit the size chart yourself
New section in the product form (Admin → Add/Edit Product), right
below SEO: add/remove size rows, each with chest/length/shoulder in
cm. Leave it empty to keep using the generic size guide for that
product — totally optional per product.

## Verified before packaging
- `npm run build` (sitemap generation + vite build) — clean
- All server files pass `node --check`
- Full server import test — every route loads and mounts correctly
