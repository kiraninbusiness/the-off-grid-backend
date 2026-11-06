-- Order creation idempotency for mobile checkout retries.
-- Apply through the reviewed migration process; never run automatically at API startup.
BEGIN;

CREATE TABLE IF NOT EXISTS order_requests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS order_requests_created_at_idx
  ON order_requests (created_at);

COMMIT;
