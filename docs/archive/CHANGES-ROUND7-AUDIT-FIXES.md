# Fixes applied from the Round 7 audit

## 🔴 Critical/High (all fixed — real code bugs)

1. **Gift-card webhook database bug.** `webhooks.js` tried to write
   `gift_cards.razorpay_payment_id`, but the migration only ever added
   that column to `orders`, not `gift_cards` — this was a bug I introduced
   in an earlier round while fixing the gift-card payment-bypass issue,
   and never finished. Added the missing column, and also fixed
   `giftcards.js`'s normal `/verify-payment` path, which had the same gap.

2. **Stock-alert unique constraint blocked multi-size subscriptions.**
   The original `UNIQUE(product_id, email)` predates variant-specific
   alerts and was never widened — "Black Tee / M" and "Black Tee / L"
   alerts for the same customer collided on insert. Replaced with a
   `(product_id, email, COALESCE(variant_id, 0))` index, migrated safely
   (finds and drops the old constraint by inspecting `pg_constraint`
   rather than assuming its generated name).

3. **Saving the admin variant grid destroyed existing stock alerts.**
   The endpoint did `DELETE FROM product_variants WHERE product_id = $1`
   and recreated every row from scratch on every save — since
   `stock_alerts.variant_id` cascades on delete, this silently wiped
   every customer's "notify me" subscription for that product, even for
   sizes the admin didn't touch. It also meant the `ON CONFLICT` clause
   right below it could never fire (nothing was ever left to conflict
   with). Rewritten to only delete variants actually removed from the
   grid and UPSERT the rest in place — unchanged variants keep their
   real row id, so their alerts survive.

4. **Back-in-stock emails didn't say which size/color restocked.**
   `notifyRestock()` always sent a generic "PRODUCT NAME is back in
   stock" email even for size-specific alerts. Now looks up the
   variant's size/color and includes it in both the subject and body —
   "ZENITH TEE — BLACK / M is back in stock" instead of just the
   product name.

## Verified as already correctly handled (no change needed)
- 9 (abandoned-cart scheduler): the `/cron-send` + `CRON_SECRET` endpoint
  from the Round 3 fixes is present and correct — this just needs an
  actual external cron (Render Cron/GitHub Actions) pointed at it, which
  is a deployment step, not code.

## Deliberately not touched (need your credentials/decisions/config, not code)
- **5. Real courier integration** — the audit's own recommendation
  (manual courier/AWB/tracking entry) is acceptable for a small launch;
  Shiprocket/Delhivery integration needs your actual courier account.
- **6. GST/company placeholders** — needs your real legal name, address,
  GSTIN, support email; inventing these would be actively wrong.
- **7. SMTP** and **8. Cloudinary** — both are "code is ready, just add
  the env vars" per the audit itself; nothing to fix in code.
- **10–24** — the audit itself marks these Medium/Low/Future/Optional/Not
  needed at current scale, so left as-is.

---
All four fixes verified with real syntax checking (genuine ESM parsing
for every server file, genuine JSX compilation for every client file).
Zero failures.
