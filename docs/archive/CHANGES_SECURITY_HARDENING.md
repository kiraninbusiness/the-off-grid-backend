# THE OFF GRID — Security hardening pass

Covers the 25-item audit. Split honestly into what's actually code
(built and verified below) vs. what needs your action in a dashboard
somewhere — see the bottom of this file for that list.

## Built this round

**1. Rate limiting** — login (10/15min), forgot-password (5/15min),
register (5/hr), contact (10/hr), newsletter (5/hr), general API
(300/15min). `trust proxy` configured correctly for Render/Vercel.

**2. Helmet + CSP** — configured with explicit allowances for Google
Sign-In and Razorpay (both need iframe/script access), everything else
locked down.

**3. CORS tightened** — explicit origin whitelist (`CLIENT_URL` +
optional `CLIENT_URL_WWW`) instead of trusting a single value.

**4. Password policy** — 12-character minimum everywhere (register,
reset, profile change), frontend hints and backend validation both
updated.

**5. Password reset tokens hashed** — SHA-256. The raw token only
ever exists in the email link; a DB leak alone can't produce usable
reset links anymore.

**6. File upload security, rewritten** — real magic-byte detection via
`file-type` (not extension/MIME trust), images decoded and re-encoded
through Sharp (a spoofed or corrupted file won't survive that step),
dimension caps, and **Cloudinary is now mandatory in production** —
local disk is refused outright rather than silently falling back,
since it doesn't survive a Render redeploy.

**7. Standardized error handling** — global handler, never leaks stack
traces / SQL errors / filesystem paths to the client.

**8. Request validation** — quantity, address, and rating fields
already had server-side bounds checking from earlier rounds; extended
with sanitization (below). A full Zod schema layer across every
endpoint is still open — see "not done" below.

**9. Frontend price trust** — audited: order totals are entirely
server-calculated from the database (never the browser), same for
discounts, loyalty points, gift cards, and combo pricing. No changes
needed, confirmed already correct.

**10. Admin audit log** — new table + `logAdminAction()` helper, wired
into product price changes, product deletion, review hide/delete, and
refunds. `GET /admin/audit-log` exists; no admin UI panel for it yet.

**11. Admin 2FA (TOTP)** — fully built, backend and frontend: QR-code
setup, enable/disable (disable requires password + a valid code), and
a real two-step login flow — password first, then a 6-digit code,
before any session token is issued. Lives in Account → Profile for
admin accounts.

**12. XSS sanitization** — reviews, contact messages, and both
registration/profile-edit names are stripped of all HTML before
storage. React already escapes render output; this covers the email
templates too, which use raw HTML strings.

**13. Razorpay webhook idempotency** — unique index on
`orders.razorpay_payment_id` so the same payment can't settle two
orders, wrapped in a try/catch so it can't crash startup if
duplicates already exist in production data (would need a manual
cleanup pass in that case).

**14. Stock race-condition, defense-in-depth** — the existing
transaction already used `FOR UPDATE` row locks (already race-safe);
added `WHERE stock >= quantity` guards on the decrement itself as a
second layer, with an explicit error if it ever fires.

**15. Coupon abuse — real enforcement, not just schema** — new
`coupon_redemptions` table, checked at order creation
(`max_uses_per_user`, default 1), reversed cleanly on cancellation.

**16. Referral abuse mitigation** — added a lifetime cap (20 paid
bonuses) per referrer. Full protection against mass fake-account
farming needs email/phone verification, which doesn't exist anywhere
in the app yet — that's a separate, real project, not a quick add.

**17. Dependency audit** — ran `npm audit`, found 8 vulnerabilities
including a HIGH severity one in the Sharp version I'd just added for
image validation. Fixed by bumping to Sharp 0.35.4 (verified the app's
usage — metadata/rotate/toFormat/toBuffer — is unaffected by the
version jump). Down to 7 remaining, all MODERATE, all transitive
dependencies of `express` (via `qs`/`body-parser`) and
`google-auth-library` (via `gaxios`/`uuid`) — fixing those requires
major-version bumps to `express` or `google-auth-library` themselves,
which I did not do blind in this pass since that's a real breaking-
change risk better tested deliberately rather than forced through
`npm audit fix --force` alongside twenty other changes.

## Verified before packaging
- `vite build` — clean
- All server files pass `node --check`
- Full server import test — every route loads and mounts correctly
- `npm audit` run and partially remediated (see above)

## Not done this round, with reasons

- **JWT refresh-token architecture** (short-lived access token +
  httpOnly refresh cookie + session table + rotation + reuse
  detection) — deliberately not attempted here. This is the single
  highest-risk item on the whole list: it touches every authenticated
  request on both frontend and backend, and getting it wrong mid-way
  through a batch of twenty other changes is how you lock yourself out
  of your own admin account at 2am. It deserves its own dedicated,
  carefully-tested round.
- **Exhaustive Zod validation** on every endpoint — the highest-risk
  ones (orders, cart) already had reasonable manual validation from
  earlier rounds; a full schema-per-endpoint pass is still open.
- **Database security** (dedicated non-superuser DB role, network
  restriction, automated backups, point-in-time recovery) — Neon/
  Render dashboard configuration, not application code.
- **Secrets rotation** — you have to actually regenerate these
  yourself in each provider's dashboard (Neon, Vercel, Render,
  Razorpay, Cloudinary, SMTP). Nothing I can do from here touches your
  real production credentials.
- **SPF/DKIM/DMARC** — DNS records on your domain registrar, not code.
- **Real-time security alerting** ("50 failed admin logins in 5
  minutes → alert") — the underlying data now exists
  (`login_attempts`, `admin_audit_logs`), but real alerting needs an
  external monitoring service (Sentry, Better Stack, etc.) with its
  own account — I built the data source, not the alerting pipeline.
