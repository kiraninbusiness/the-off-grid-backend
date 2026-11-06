# Database migrations

## Current safety state

The API startup path is read-only. `src/server.js` calls `initDb()`, which now
only verifies `DATABASE_URL` connectivity with `SELECT 1`. It does not create,
alter, backfill, normalize, delete, or seed database records.

The `20261106_001_order_idempotency.sql` migration is a reviewed draft and has
been applied only to the isolated `phase1-order-safety-staging` Neon branch.
It has not been applied to production. The repository still has no automatic
migration runner; production rollout requires staging tests, a restorable backup,
and explicit approval. The live Neon schema must be re-compared before any
additional migration is approved.

## Required process before adding a migration

1. Create a separate Neon staging branch from the production branch.
2. Take/verify a restorable backup before any schema work.
3. Compare staging schema with the exact API requirements, including existing
   foreign keys, unique indexes, payment/refund fields, cart, returns, loyalty,
   referrals, and product variants.
4. Write small, ordered SQL migrations. Do not include customer-data cleanup,
   quantity caps, cart deletion, sample catalog seeding, automatic admin
   promotion, or unreviewed backfills.
5. Make each migration transactional where PostgreSQL supports it, record its
   version in a migration ledger, and provide a tested rollback or recovery plan.
6. Apply migrations to staging only, run API tests and website/mobile end-to-end
   checks, then obtain explicit approval before any production migration.

## Production policy

Do not run schema changes automatically at API startup. Do not point an
unreviewed migration at the production Neon connection string. Do not deploy
this draft until the required schema diff and staging validation are complete.
