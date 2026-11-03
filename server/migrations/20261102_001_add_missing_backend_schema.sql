-- The Off Grid: backend schema additions identified by staging audit
-- Version: 20261102_001
-- Tested against Neon branch: staging-backend-nov-2026
-- This migration is additive and idempotent. It does not rewrite existing rows.
-- Apply only through an explicitly approved migration process after backup.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS birthday_reward_year INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
  ON public.users(phone) WHERE phone IS NOT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS model_height_cm INTEGER,
  ADD COLUMN IF NOT EXISTS model_wears_size TEXT,
  ADD COLUMN IF NOT EXISTS fabric_gsm INTEGER,
  ADD COLUMN IF NOT EXISTS fabric_composition TEXT,
  ADD COLUMN IF NOT EXISTS early_access_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS early_access_tier TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reconciliation_status TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gift_message TEXT,
  ADD COLUMN IF NOT EXISTS packaging_fee INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS min_tier TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.otp_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  requests_in_hour INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.review_photos (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS review_photos_review_idx
  ON public.review_photos(review_id);

CREATE TABLE IF NOT EXISTS public.creator_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','youtube','tiktok')),
  handle TEXT NOT NULL,
  secondary_handle TEXT,
  follower_count BIGINT NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
  audience TEXT NOT NULL,
  bio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paused')),
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS creator_applications_status_created_idx
  ON public.creator_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cart_merge_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx
  ON public.user_push_tokens(user_id);

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS razorpay_webhook_events_status_idx
  ON public.razorpay_webhook_events(status, received_at);

CREATE TABLE IF NOT EXISTS public.loyalty_refund_reversals (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL UNIQUE REFERENCES public.returns(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refund_amount INTEGER NOT NULL CHECK (refund_amount > 0),
  points_reversed INTEGER NOT NULL CHECK (points_reversed >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.points_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_ledger_user_idx
  ON public.points_ledger(user_id, id DESC);

COMMIT;
