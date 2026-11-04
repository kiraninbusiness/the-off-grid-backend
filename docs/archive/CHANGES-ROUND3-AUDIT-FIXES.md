# Fixes applied from the Round 3 audit

## 🔴 Critical / financial (all fixed)
1. **Gift card payment bypass (P0)** — purchase used to create and email an
   active gift card with no payment step at all. Now creates a pending,
   inactive, zero-balance card + a real Razorpay order; the card only
   activates (and only then gets emailed) once `/verify-payment` confirms
   a genuine HMAC-signed payment. Frontend now opens the real Razorpay
   checkout modal instead of calling purchase directly.
2. **Razorpay webhook** — new `routes/webhooks.js`, mounted with raw-body
   parsing *before* the JSON middleware (required for signature
   verification to work at all). Handles `payment.captured` (catches
   browser-closed-after-paying for both orders and gift cards),
   `payment.failed`, and `refund.processed`.
3. **Real Razorpay refunds** — found and fixed a prerequisite bug first:
   `razorpay_payment_id` was verified at checkout but never stored, so a
   refund would have had nothing to refund against. Added
   `POST /returns/:id/refund`, which calls Razorpay's real Refund API and
   only marks a return refunded once Razorpay confirms it. Direct
   status-PATCH now refuses to fake-refund an online-paid order.

## 🟠 High/medium (all fixed)
6. **WhatsApp placeholder** — now driven by `VITE_WHATSAPP_NUMBER`.
7. **Abandoned-cart automation** — added `CRON_SECRET`-protected
   `/cron-send` (external schedulers never need a personal admin JWT) and
   an opt-in internal scheduler for always-on deployments, with an honest
   comment on why the internal one alone isn't reliable on scale-to-zero
   hosting.
8. **Cart sync gaps** — root cause was the server cart-item id never
   being carried into local state, so there was nothing to call DELETE
   with. Fixed at the source; quantity +/- and remove now sync correctly.
11. **SEO** — `slug`/`meta_title`/`meta_description` on products,
    `/product/:id/:slug` pretty URLs (fully backward compatible — bare
    `/product/:id` still works everywhere), dynamic `<title>`/meta
    description/canonical/OG tags + JSON-LD `Product` structured data on
    the PDP via a small dependency-free hook.
12. **Legal pages** — Shipping, Return & Refund, Cancellation, Privacy,
    Cookie, Terms & Conditions — all routed and linked from a rebuilt
    footer that also now lists every real category dynamically.
13. **Contact/support** — real page with a topic dropdown, backed by a
    genuine `/api/contact` endpoint + admin inbox (not silently dropped).
18. **SKU/barcode/cost price** on variants, plus a `stock_movements`
    ledger logging every stock change with a reason and reference.
21. **Invoice** — print-friendly `/invoice/:id` page (browser
    print-to-PDF, no new dependency), itemized with size/color, billing
    address, payment info. Deliberately does NOT fabricate a GST
    breakdown — shows tax-inclusive total with placeholders for your
    real GSTIN once confirmed.

## Deliberately not done (need your accounts/decisions, not more code)
4. **Courier integration** (Shiprocket/Delhivery/etc) — needs your actual
   courier account credentials.
5. **Cloudinary/S3 for uploads** — needs your actual storage account.
20. **GST breakdown numbers** — needs your confirmed GSTIN/tax setup;
    inventing figures here would be actively wrong, not just incomplete.

## Explicitly deprioritized (audit itself marked these "not urgent")
14 (loyalty tiers/expiry), 15 (review photos/helpful votes), 16 (admin
analytics dashboard), 17 (full PIM), 22 (advanced shipping-rate engine),
10 (pagination wiring — fine at current catalogue size), 9 (variant-level
wishlist — audit itself says not worth prioritizing).

---
Every change in this pass was verified with real syntax checking: genuine
JSX compilation (esbuild) for every client file, genuine ESM parsing for
every server file, and a full sweep for missing local imports. Zero
failures.
