# Feature audit vs Snitch / Wrogn / Rare Rabbit + premium polish pass

No layout or structure was changed. This pass fixed a real rendering bug
and added visual polish only.

## Critical fix: the shop page's filter system had zero CSS
`ProductDiscovery.jsx` — the component that powers your entire shop grid
(category/gender/fit/color/size/stock/price filters, quick tabs, sort,
mobile filter drawer) — was fully built and wired to real data, but not
a single one of its ~35 CSS classes existed anywhere in the stylesheet.
It would have rendered as unstyled, browser-default HTML: no borders, no
spacing, no active states, buttons stacking on top of each other.

Same problem in two more places:
- The product image **zoom lightbox** (`gallery-lightbox` and its
  children) had no CSS — clicking to zoom an image would show a broken,
  unstyled overlay.
- The **"Complete The Look"** section on product pages (`CompleteTheLook.jsx`)
  had no CSS at all.

**Fixed:** wrote complete CSS for all three, using your existing design
tokens (`--ink`, `--orange`, `--paper`, `--line`), Space Grotesk for
headings, DM Sans for body copy, and the same uppercase/wide-letter-spacing
label style used everywhere else on the site. Nothing was redesigned —
this fills in gaps that were simply never styled.

## Premium polish pass
Snitch, Wrogn, and Rare Rabbit all lean on fast, quiet motion — hover
states, subtle scale/opacity changes — to feel expensive. Your stylesheet
had only 8 hover states in total. Added:
- Hover feedback on every button and link (color/background transitions)
- Subtle press-down effect on primary buttons (`transform:scale(.98)`)
- Wishlist heart micro-bounce on hover
- Category tile image zoom on hover
- Orange-on-hover for nav links, footer links, and text buttons
- Visible focus rings on form inputs (accessibility + polish)

No colors, fonts, spacing, or layout were changed — only motion and
interaction feedback layered on top of the existing design.

## Feature comparison — THE OFF GRID vs Snitch / Wrogn / Rare Rabbit

| Feature | Snitch/Wrogn/Rare Rabbit | THE OFF GRID |
|---|---|---|
| Category/gender/fit/color/size/price filters | Yes | Yes (now correctly styled) |
| Quick filter tabs (New/Bestseller/Sale) | Yes | Yes |
| Live search with autocomplete | Yes | Yes |
| Wishlist | Yes | Yes |
| Quick View modal | Yes | Yes |
| Product image gallery + zoom | Yes | Yes (now correctly styled) |
| Size guide | Yes | Yes (category-aware) |
| Reviews with verified purchase badge | Yes | Yes |
| Coupon codes | Yes | Yes |
| Loyalty points program | Some brands | Yes |
| Referral program | Some brands | Yes |
| Saved addresses | Yes | Yes |
| Order tracking | Yes | Yes |
| "Complete the look" cross-sell | Yes | Yes (now correctly styled) |
| Related / recently viewed products | Yes | Yes |
| PWA / installable | Some brands | Yes |
| Razorpay / online payment + COD | Yes | Yes |
| **Gift cards** | Yes | Not built |
| **Store locator / try-in-store** | Physical retail brands only | N/A (online-only, not applicable) |
| **Image search** | Snitch only (AI feature) | Not built |
| **Voice search** | Snitch only | Not built |
| **Multiple size/color SKU-level inventory** | Yes | Partial — stock is per-product, not per size/color combination |

The gaps that remain (gift cards, image/voice search, true SKU-level
variant inventory) are all legitimate scope additions, not bugs — happy
to build any of them next if useful.
