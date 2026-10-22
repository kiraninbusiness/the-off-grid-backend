# CHANGES — Missing functionality build-out

This pass closes out the gaps identified in the last two audits.

## Fixed / completed
- **Password reset** — now sends a real email (SMTP, configurable via `.env`) instead of only
  logging the link. Added the missing `ResetPassword.jsx` page at `/reset-password`.
- **Checkout saved addresses** — customers can now pick a saved address at checkout instead of
  retyping it every time.
- **Bug fix** — `PATCH /orders/:id/status` referenced an undefined `client` variable and would
  have thrown on every admin status update. Fixed.
- **Returns / exchanges** — full request → admin review → status-update flow, with a 10-day
  return window enforced from `delivered_at`. Visible on the Orders page and in a new Account
  "Returns" tab. Admin has a queue to approve/reject/mark refunded or exchanged.
- **Transactional emails** — order confirmation, shipped/delivered/cancelled status changes,
  back-in-stock alerts, and return/exchange status updates all send real email now (or log to
  console if SMTP isn't configured yet).
- **SKU-level inventory** — new `product_variants` table tracks stock per size+color
  combination. Order placement, cancellation, and admin restocking all respect it. Products
  without variants keep working exactly as before (backward compatible).
- **Loyalty points at checkout** — customers can now see and redeem their points balance
  directly on the checkout page, not just view it in Rewards.
- **Referral sharing** — added a "Share on WhatsApp" button next to the existing copy-code
  button.
- **Admin: customer management** — list of all customers with order count, lifetime spend,
  loyalty points, referral count; click through for order/address detail.
- **Admin: review moderation** — hide or delete any review. Hidden reviews no longer show on
  the public product page.
- **Admin: stock-alert visibility** — see how many customers are waiting on a restock per
  product.

## Intentionally not built this pass
- Server-side cart/wishlist (still localStorage — fine at current traffic, revisit if multi-device
  usage becomes common)
- Product pagination (fine at the current catalogue size; the `/products` query params already
  support filtering server-side)
- Image upload to a CDN (admin still pastes image URLs — needs your own S3/Cloudinary credentials
  before this can be built)

## Deployment notes
- New env vars in `server/.env.example`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM`, `FRONTEND_URL`. Without SMTP configured, all emails print to the server console
  instead of sending — nothing breaks, you just won't get real emails until you add a provider
  (Resend, SendGrid, Brevo, Zoho, or Gmail with an app password all work over SMTP).
- Run `npm install` in `server/` to pull in the new `nodemailer` dependency.
- DB migrations run automatically on server start via `initDb()` — no manual migration step.
