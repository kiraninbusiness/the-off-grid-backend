import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      gender TEXT DEFAULT 'Unisex',
      size TEXT NOT NULL,
      condition TEXT DEFAULT 'Excellent',
      price INTEGER NOT NULL,
      old_price INTEGER,
      image TEXT NOT NULL,
      images TEXT[] DEFAULT '{}',
      stock INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders(
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT NOT NULL DEFAULT 'cod',
      razorpay_order_id TEXT,
      total INTEGER NOT NULL,
      shipping_name TEXT,
      shipping_phone TEXT,
      shipping_address TEXT,
      shipping_email TEXT,
      shipping_city TEXT,
      shipping_state TEXT,
      shipping_pincode TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items(
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      selected_size TEXT,
      selected_color TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews(
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT DEFAULT '',
      verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS newsletter_subscribers(
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod'");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_email TEXT");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city TEXT");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state TEXT");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_pincode TEXT");
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'");
  await pool.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size TEXT");
  await pool.query("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_color TEXT");
  await pool.query("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token TEXT,
    ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS referral_bonus_given BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupons(
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'percent',
      value INTEGER NOT NULL,
      min_order INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER,
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT, ADD COLUMN IF NOT EXISTS coupon_discount INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS color TEXT, ADD COLUMN IF NOT EXISTS fit TEXT`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS video TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_addresses(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'HOME',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      pincode TEXT NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses(user_id);
  `);
  // Stock alerts ("notify me when back in stock")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_alerts(
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      notified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, email)
    );
  `);
  await pool.query("ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS notified BOOLEAN NOT NULL DEFAULT FALSE");

  // Returns / exchanges
  await pool.query(`
    CREATE TABLE IF NOT EXISTS returns(
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'return',
      reason TEXT NOT NULL DEFAULT '',
      exchange_size TEXT,
      exchange_color TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      refund_amount INTEGER,
      admin_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS returns_user_idx ON returns(user_id);
    CREATE INDEX IF NOT EXISTS returns_order_idx ON returns(order_id);
  `);

  // Review moderation
  await pool.query("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE");

  // Delivery timestamp — needed for return-window calculations
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ");

  // Gift cards
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gift_cards(
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      initial_value INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      purchased_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      message TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );    CREATE TABLE IF NOT EXISTS gift_card_redemptions(
      id SERIAL PRIMARY KEY,
      gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_code TEXT, ADD COLUMN IF NOT EXISTS gift_card_discount INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS combo_discount INTEGER NOT NULL DEFAULT 0`);

  /*
    GIFT CARD PAYMENT GATING (P0 fix)
    A gift card row is now created in a pending/inactive state with a
    Razorpay order attached — it only becomes active (and only then
    is the recipient emailed) once /gift-cards/verify-payment confirms
    a real, signature-verified Razorpay payment. Previously a gift
    card was created and emailed immediately on request, with no
    payment step at all.
  */
  await pool.query(`
    ALTER TABLE gift_cards
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
      ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
      ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
      ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'online'
  `);

  /*
    REAL RAZORPAY REFUNDS + WEBHOOK RECONCILIATION
    orders.razorpay_payment_id was verified at checkout but never
    actually stored — without it there's nothing to call Razorpay's
    Refund API against. returns gets the columns needed to record a
    real refund transaction (not just a status label).
  */
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`);

  // Google Sign-In — nullable, unique when set. Existing password-based
  // accounts can also sign in with Google later if the email matches.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL`);

  /* ===== ROUND 7: replacement shipment lifecycle for exchanges ===== */
  await pool.query(`
    ALTER TABLE returns
      ADD COLUMN IF NOT EXISTS replacement_status TEXT,
      ADD COLUMN IF NOT EXISTS replacement_courier TEXT,
      ADD COLUMN IF NOT EXISTS replacement_awb TEXT,
      ADD COLUMN IF NOT EXISTS replacement_tracking_url TEXT,
      ADD COLUMN IF NOT EXISTS replacement_shipped_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS replacement_delivered_at TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE returns
      ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT,
      ADD COLUMN IF NOT EXISTS refund_settled_at TIMESTAMPTZ
  `);

  // Server-side cart & wishlist — synced across devices for logged-in users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      selected_size TEXT,
      selected_color TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      abandoned_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(user_id, product_id, selected_size, selected_color)
    );
    CREATE TABLE IF NOT EXISTS wishlist_items(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, product_id)
    );
  `);

  // Combo / bundle deals — e.g. "any 3 tees for ₹1999"
  await pool.query(`
    CREATE TABLE IF NOT EXISTS combo_deals(
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT,
      quantity INTEGER NOT NULL,
      bundle_price INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // SKU-level variant inventory (size + color combination stock)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_variants(
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, size, color)
    );
    CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id);
  `);

  // SKU/barcode/cost fields on each size+color variant — becomes useful once
  // you're shipping enough orders that "the black medium tee" isn't precise
  // enough on a packing slip.
  await pool.query(`
    ALTER TABLE product_variants
      ADD COLUMN IF NOT EXISTS sku TEXT,
      ADD COLUMN IF NOT EXISTS barcode TEXT,
      ADD COLUMN IF NOT EXISTS cost_price INTEGER
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants(sku) WHERE sku IS NOT NULL AND sku <> ''`);

  /*
    SEO — slug, meta title/description, canonical support.
    /product/:id keeps working exactly as before (nothing that already
    links to it breaks); the frontend additionally accepts and generates
    /product/:id/:slug for real, readable, indexable URLs, and reads
    meta_title/meta_description for that product's <title>/meta tags
    and JSON-LD structured data.
  */
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS slug TEXT,
      ADD COLUMN IF NOT EXISTS meta_title TEXT,
      ADD COLUMN IF NOT EXISTS meta_description TEXT
  `);
  await pool.query(`
    UPDATE products SET slug =
      LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || id
    WHERE slug IS NULL
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products(slug)`);

  /*
    INVENTORY MOVEMENT LOG — lightweight ledger of every stock change
    and why it happened (order placed, order cancelled/restored, return
    received, manual admin adjustment). Not a full PIM inventory system,
    but enough to answer "why is this at 12 units" without guessing.
  */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements(
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
      change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id);
  `);

  await pool.query(`UPDATE users SET referral_code = UPPER(SUBSTRING(MD5(id::text || RANDOM()::text) FOR 6)) WHERE referral_code IS NULL`);

  /* ===== SECURITY HARDENING ADDITIONS ===== */

  // Admin audit log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs(
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      admin_email TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      old_value JSONB,
      new_value JSONB,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC)`);

  // Admin TOTP 2FA
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS totp_secret TEXT,
      ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Failed-login tracking (basic brute-force visibility, feeds the audit log)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts(
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      ip TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts(email, created_at DESC)`);

  // Idempotency: a given Razorpay payment should only ever settle one order.
  // Wrapped in try/catch — if duplicate payment_ids somehow already exist
  // in production data, this shouldn't crash server startup; it'll just
  // need a manual cleanup pass before the constraint can be added.
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_payment_unique ON orders(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL`);
  } catch (e) {
    console.error('Could not create orders_razorpay_payment_unique index (likely pre-existing duplicates) — investigate manually:', e.message);
  }

  // Coupon abuse: per-user usage tracking (was only a global used_count before)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupon_redemptions(
      id SERIAL PRIMARY KEY,
      coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(coupon_id, user_id, order_id)
    )
  `);
  await pool.query(`ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses_per_user INTEGER NOT NULL DEFAULT 1`);

  // Referral abuse: only pay out once the referred user actually completes a purchase
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_reward_paid BOOLEAN NOT NULL DEFAULT FALSE`);

  /* ===== ROUND 5 ADDITIONS ===== */

  // Product fields the admin form never actually exposed
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS material TEXT,
      ADD COLUMN IF NOT EXISTS care_instructions TEXT,
      ADD COLUMN IF NOT EXISTS model_details TEXT
  `);

  // Gift card resend tracking
  await pool.query(`ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS resent_count INTEGER NOT NULL DEFAULT 0`);

  // SKU-level stock alerts (was product-level only — restocking any
  // size used to email everyone waiting on any size of that product)
  await pool.query(`ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE`);

  /*
    STOCK ALERT UNIQUENESS FIX
    The original UNIQUE(product_id, email) constraint predates
    variant-specific alerts, and never got widened when variant_id
    was added above — it still blocks a customer from subscribing to
    "Black Tee / M" and "Black Tee / L" separately, since both rows
    share the same product_id + email. Replaced with an index on
    (product_id, email, variant) where "variant" collapses a NULL
    variant_id (a plain product-wide alert, not tied to one size) to
    0 — Postgres treats NULL as distinct from itself in a unique
    constraint, so without this a customer could otherwise queue up
    unlimited duplicate product-wide alerts too.
  */
  await pool.query(`
    DO $$
    DECLARE c_name text;
    BEGIN
      SELECT conname INTO c_name
      FROM pg_constraint
      WHERE conrelid = 'stock_alerts'::regclass
        AND contype = 'u'
        AND conkey = (
          SELECT array_agg(attnum ORDER BY attnum)
          FROM pg_attribute
          WHERE attrelid = 'stock_alerts'::regclass
            AND attname IN ('product_id','email')
        );
      IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE stock_alerts DROP CONSTRAINT %I', c_name);
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_product_email_variant_idx
    ON stock_alerts (product_id, email, COALESCE(variant_id, 0))
  `);

  if(process.env.ADMIN_EMAIL){ await pool.query("UPDATE users SET role='admin' WHERE email=$1",[process.env.ADMIN_EMAIL.toLowerCase()]); }
  /* ===== CART DUPLICATE-ROW FIX =====
     Postgres treats NULL as distinct from NULL in unique constraints,
     so ON CONFLICT (user_id, product_id, selected_size, selected_color)
     never matched when either was NULL — every "add to bag" click on
     a product with no size/color silently inserted a brand new row
     instead of incrementing quantity, causing runaway duplicate cart
     rows. Fix: normalize NULL to '' (empty string IS comparable),
     collapse any duplicate rows already sitting in the database
     (summing their quantities into one), then make the columns
     NOT NULL going forward so this can't happen again.

     DEPLOY-CRASH FIX: the normalize UPDATE below can itself violate
     the very constraint it's trying to fix — if a NULL row and an
     already-'' row exist for the same user+product (e.g. from a
     previous partial run of this migration, or from before this
     table had the constraint at all), setting NULL -> '' collides
     with the existing '' row and Postgres rejects the UPDATE with
     "duplicate key value violates unique constraint
     cart_items_user_id_product_id_selected_size_selected_color_key"
     — which is the exact error that was crashing every deploy. The
     constraint has to come off before normalizing, and go back on
     (as an index, which is all ON CONFLICT actually needs) only after
     the data underneath it is already clean. */
  await pool.query(`ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_selected_size_selected_color_key`);
  await pool.query(`UPDATE cart_items SET selected_size = COALESCE(selected_size, ''), selected_color = COALESCE(selected_color, '')`);
  await pool.query(`
    WITH duplicates AS (
      SELECT user_id, product_id, selected_size, selected_color,
             MIN(id) AS keep_id, SUM(quantity) AS total_qty
      FROM cart_items
      GROUP BY user_id, product_id, selected_size, selected_color
      HAVING COUNT(*) > 1
    )
    UPDATE cart_items c SET quantity = d.total_qty
    FROM duplicates d WHERE c.id = d.keep_id
  `);
  await pool.query(`
    DELETE FROM cart_items c
    USING cart_items c2
    WHERE c.user_id = c2.user_id AND c.product_id = c2.product_id
      AND c.selected_size = c2.selected_size AND c.selected_color = c2.selected_color
      AND c.id > c2.id
  `);
  await pool.query(`ALTER TABLE cart_items ALTER COLUMN selected_size SET DEFAULT '', ALTER COLUMN selected_size SET NOT NULL`);
  await pool.query(`ALTER TABLE cart_items ALTER COLUMN selected_color SET DEFAULT '', ALTER COLUMN selected_color SET NOT NULL`);
  // Data underneath is guaranteed duplicate-free by the DELETE above, so
  // this is now safe to (re)create — and it's what ON CONFLICT (user_id,
  // product_id, selected_size, selected_color) in cart.js targets.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_variant_idx
    ON cart_items (user_id, product_id, selected_size, selected_color)
  `);

  /* ===== EMERGENCY CART QUANTITY SANITIZATION =====
     A separate, worse bug (now fixed in App.jsx) had the frontend
     calling the ADDITIVE cart-merge endpoint on every single page
     load with a persisted session — not just on an actual login. That
     roughly doubled every cart line's quantity every time the site
     was reopened, capable of reaching 1000+ "items" with zero user
     action. No real customer has genuinely added that many of
     anything, so any existing quantity in the multi-hundreds is
     certainly bug fallout, not real intent — reset to 1 rather than
     preserved, since there's no way to recover what was actually
     intended from a corrupted number. */
  await pool.query(`UPDATE cart_items SET quantity = 1 WHERE quantity > 20`);

  /* ===== CART SANITY CAP =====
     Collapsing duplicate rows above only fixes the row-count side of
     the bug — if a single row's quantity was already inflated (e.g.
     from repeated merge calls compounding before the merge-guard fix
     below), summing duplicates together still lands on the same
     inflated total. A real customer essentially never has 50+ of the
     same item in their cart, so treat totals that large as leftover
     bug damage: cap any absurd single-line quantity, and if a user's
     whole cart is still absurd after that, just clear it rather than
     preserve a nonsense number. Safe to run every startup — a normal
     cart is always well under these thresholds and is never touched. */
  await pool.query(`UPDATE cart_items SET quantity = 10 WHERE quantity > 10`);
  await pool.query(`
    DELETE FROM cart_items WHERE user_id IN (
      SELECT user_id FROM cart_items GROUP BY user_id HAVING SUM(quantity) > 50
    )
  `);

  /* ===== ROUND 10 ADDITIONS ===== */

  // Wishlist price-drop tracking
  await pool.query(`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS last_known_price INTEGER`);

  // In-app notification center
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications(
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC)`);

  // Order modification before shipping — track that an order was edited
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);

  // Separate replacement order system for exchanges
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'standard'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS replacement_for_return_id INTEGER REFERENCES returns(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE returns ADD COLUMN IF NOT EXISTS replacement_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`);

  // Staged abandoned-cart sequence (was a single boolean — now tracks
  // which stage of the 30min/6hr/24hr/48hr sequence has been sent)
  await pool.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS abandoned_stage INTEGER NOT NULL DEFAULT 0`);

  // Per-product custom size chart (chest/length/shoulder in cm per size)
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_chart JSONB`);

  const {rows}=await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if(rows[0].count===0){
    await pool.query(`INSERT INTO products
      (name,description,category,gender,size,condition,price,old_price,image,stock,color,fit)
      VALUES
      ('ZENITH OVERSIZED TEE','Heavyweight oversized cotton tee designed for everyday wear.','T-SHIRTS','UNISEX','S / M / L / XL','NEW',1599,1999,'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=90',12,'CHARCOAL','OVERSIZED'),
      ('LUNA LINEN SHIRT','Relaxed linen shirt with a clean silhouette and lightweight feel.','SHIRTS','UNISEX','S / M / L / XL','NEW',2499,2999,'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=1200&q=90',8,'OFF WHITE','RELAXED'),
      ('TERRA CARGO PANTS','Utility-inspired cargo pants with a relaxed streetwear fit.','BOTTOMS','UNISEX','28 / 30 / 32 / 34 / 36','NEW',2799,3299,'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1200&q=90',10,'OLIVE','RELAXED'),
      ('SIGNATURE HOODIE','Premium heavyweight hoodie with an oversized silhouette.','HOODIES','UNISEX','S / M / L / XL','BESTSELLER',3299,3999,'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=1200&q=90',15,'BONE','OVERSIZED'),
      ('RAYON BOMBER JACKET','Minimal bomber jacket with a structured modern silhouette.','JACKETS','UNISEX','S / M / L / XL','NEW',3999,4999,'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1200&q=90',6,'BLACK','REGULAR'),
      ('CLASSIC OFF GRID CAP','Minimal six-panel cap finished with The Off Grid branding.','ACCESSORIES','UNISEX','ONE SIZE','NEW',999,1299,'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=1200&q=90',20,'BLACK','ADJUSTABLE'),
      ('CORE RIBBED TANK','Clean ribbed tank designed for layering or standalone wear.','TANK TOPS','UNISEX','S / M / L / XL','NEW',1299,1599,'https://images.unsplash.com/photo-1618354691373-d851c5c3c990?auto=format&fit=crop&w=1200&q=90',14,'BLACK','SLIM'),
      ('GRID RUNNER SNEAKERS','Everyday sneakers built around a clean technical streetwear aesthetic.','FOOTWEAR','UNISEX','6 / 7 / 8 / 9 / 10 / 11','NEW',4499,5499,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=90',9,'WHITE / GREY','REGULAR'),
      ('SHADOW UTILITY VEST','Utility vest with multiple pockets and a contemporary streetwear cut.','JACKETS','UNISEX','S / M / L / XL','NEW',2899,3499,'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=1200&q=90',7,'GRAPHITE','RELAXED'),
      ('MONOCHROME OVERSHIRT','Structured overshirt designed to work as a light outer layer.','SHIRTS','UNISEX','S / M / L / XL','NEW',2699,3199,'https://images.unsplash.com/photo-1603252110481-7ba873bf42ab?auto=format&fit=crop&w=1200&q=90',11,'GREY','RELAXED'),
      ('VOID WIDE LEG DENIM','Wide-leg denim with a relaxed profile and washed finish.','BOTTOMS','UNISEX','28 / 30 / 32 / 34 / 36','NEW',2999,3699,'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=1200&q=90',8,'WASHED BLACK','WIDE LEG'),
      ('NIGHT SHIFT TEE','Relaxed everyday tee with a vintage-inspired washed finish.','T-SHIRTS','UNISEX','S / M / L / XL','BESTSELLER',1499,1899,'https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=1200&q=90',18,'WASHED BLACK','OVERSIZED')
    `);
  }

  /*
    Idempotent addition — runs on every startup regardless of catalog
    size (unlike the block above, which only runs on a totally empty
    table). Checked by name so re-running this on a server that
    already has these products is a safe no-op.
  */
  const newProducts = [
    {
      name: 'NIGHTGUARD PADDED JACKET',
      description: 'Heavyweight padded jacket built for real cold — insulated, wind-resistant, and cut for layering.',
      category: 'JACKETS', gender: 'UNISEX', size: 'M / L / XL / XXL', condition: 'NEW',
      price: 4999, old_price: 5999,
      image: 'https://images.unsplash.com/photo-1557418669-db3f781a58c0?auto=format&fit=crop&w=1200&q=90',
      images: [
        'https://images.unsplash.com/photo-1557418669-db3f781a58c0?auto=format&fit=crop&w=1200&q=90',
        'https://images.unsplash.com/photo-1611025504703-8c143abe6996?auto=format&fit=crop&w=1200&q=90',
        'https://images.unsplash.com/photo-1706765779533-6c0210fab380?auto=format&fit=crop&w=1200&q=90',
      ],
      stock: 10, color: 'BLACK', fit: 'REGULAR',
      size_chart: [
        { size: 'M', chest_cm: 52, length_cm: 60, shoulder_cm: 46 },
        { size: 'L', chest_cm: 53, length_cm: 62, shoulder_cm: 48 },
        { size: 'XL', chest_cm: 56, length_cm: 65, shoulder_cm: 50 },
        { size: 'XXL', chest_cm: 59, length_cm: 67, shoulder_cm: 52 },
      ],
    },
    {
      name: 'SHIELD WINDCHEATER',
      description: 'Light, wind-resistant shell for everyday layering — built for transitional weather.',
      category: 'JACKETS', gender: 'UNISEX', size: 'M / L / XL / XXL', condition: 'NEW',
      price: 3499, old_price: 3999,
      image: 'https://images.unsplash.com/photo-1614031679232-0dae776a72ee?auto=format&fit=crop&w=1200&q=90',
      images: [
        'https://images.unsplash.com/photo-1614031679232-0dae776a72ee?auto=format&fit=crop&w=1200&q=90',
        'https://images.unsplash.com/photo-1556098539-3019e1bdf05e?auto=format&fit=crop&w=1200&q=90',
        'https://images.unsplash.com/photo-1614079290101-0c2181ac8ea3?auto=format&fit=crop&w=1200&q=90',
      ],
      stock: 14, color: 'BLACK', fit: 'REGULAR',
      size_chart: [
        { size: 'M', chest_cm: 50, length_cm: 60, shoulder_cm: 45 },
        { size: 'L', chest_cm: 52, length_cm: 62, shoulder_cm: 47 },
        { size: 'XL', chest_cm: 54, length_cm: 64, shoulder_cm: 54 },
        { size: 'XXL', chest_cm: 57, length_cm: 66, shoulder_cm: 56 },
      ],
    },
  ];

  for (const p of newProducts) {
    const existing = await pool.query('SELECT id FROM products WHERE name = $1', [p.name]);
    if (existing.rows.length) continue;
    await pool.query(
      `INSERT INTO products (name, description, category, gender, size, condition, price, old_price, image, images, stock, color, fit, size_chart)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.name, p.description, p.category, p.gender, p.size, p.condition, p.price, p.old_price, p.image, p.images, p.stock, p.color, p.fit, JSON.stringify(p.size_chart)]
    );
    console.log(`Seeded new product: ${p.name}`);
  }
}
if(process.argv[1]?.endsWith('src/db.js')) initDb().then(()=>{console.log('Database ready');process.exit()}).catch(e=>{console.error(e);process.exit(1)});
