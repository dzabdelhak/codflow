-- Multi-store layer (ADR-0003): roles, Row-Level Security, indexes.
--
-- codflow_app       request code. RLS applies (FORCE), so it sees and writes
--                   only the store set on its transaction:
--                   set_config('app.store_id', <id>, true)
-- codflow_platform  platform code (routing, schedulers). Bypasses RLS.
--
-- Both are NOLOGIN; the application's login switches to one with SET ROLE.
-- Creating a BYPASSRLS role needs a superuser — run migrations as one.

DO $$ BEGIN
  CREATE ROLE codflow_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE ROLE codflow_platform NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  EXECUTE format('GRANT codflow_app, codflow_platform TO %I', current_user);
EXCEPTION WHEN others THEN NULL;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO codflow_app, codflow_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codflow_app, codflow_platform;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO codflow_app, codflow_platform;
--> statement-breakpoint
-- Hostname routing is platform data: request code reads it, never edits it.
REVOKE INSERT, UPDATE, DELETE ON store_domains FROM codflow_app;
--> statement-breakpoint
-- Stores are created and deleted by the platform; request code may only read
-- and edit its own.
REVOKE INSERT, DELETE ON stores FROM codflow_app;
--> statement-breakpoint
-- Tables that already had store_id: same default as the new ones.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'store_api_keys','reviews','store_pixel_config','store_otp_config','store_email_config',
    'store_turnstile_config','store_pages','store_legal_profile'
  ] LOOP
    EXECUTE format($q$ALTER TABLE %I ALTER COLUMN store_id SET DEFAULT current_setting('app.store_id')$q$, t);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_groups','customer_group_members','customer_tags',
    'customer_tag_assignments','shipping_profiles','shipping_rules','shipping_rule_communes',
    'drivers','driver_compensations','driver_payments','delivery_companies','orders',
    'order_assignments','order_status_history','product_categories','products',
    'product_variants','product_images','order_products','company_stop_desks',
    'company_shipments','company_api_logs','activity_logs','stock_movements','webhook_events',
    'offers','landing_pages','landing_page_images','landing_page_pixel_config',
    'store_page_translations','abandoned_orders','capi_event_log',
    'store_api_keys','reviews','store_pixel_config','store_otp_config','store_email_config',
    'store_turnstile_config','store_pages','store_legal_profile'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE', t, t || '_store_fk');
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY store_isolation ON %I
      USING (store_id = current_setting('app.store_id', true))
      WITH CHECK (store_id = current_setting('app.store_id', true))$p$, t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stores FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON stores
  USING (id = current_setting('app.store_id', true))
  WITH CHECK (id = current_setting('app.store_id', true));
--> statement-breakpoint
-- Indexes that lived only in D1 migration SQL, now led by store_id where the
-- table belongs to a store (every query on those runs under one store).
CREATE UNIQUE INDEX store_pages_store_kind_unique ON store_pages (store_id, kind) WHERE kind <> 'custom';
--> statement-breakpoint
CREATE INDEX orders_store_created_idx ON orders (store_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_store_status_created_idx ON orders (store_id, status, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_store_active_idx ON orders (store_id, status, created_at DESC) WHERE status NOT IN ('delivered', 'returned', 'cancelled');
--> statement-breakpoint
CREATE INDEX orders_tracking_idx ON orders (tracking_number) WHERE tracking_number IS NOT NULL;
--> statement-breakpoint
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX orders_driver_idx ON orders (driver_id);
--> statement-breakpoint
CREATE INDEX orders_company_idx ON orders (company_id);
--> statement-breakpoint
CREATE INDEX orders_landing_page_idx ON orders (landing_page_id);
--> statement-breakpoint
CREATE INDEX order_products_order_idx ON order_products (order_id);
--> statement-breakpoint
CREATE INDEX order_products_product_idx ON order_products (product_id);
--> statement-breakpoint
CREATE INDEX order_status_history_order_ts_idx ON order_status_history (order_id, timestamp DESC);
--> statement-breakpoint
CREATE INDEX stock_movements_product_created_idx ON stock_movements (product_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX products_store_created_idx ON products (store_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX product_variants_product_position_idx ON product_variants (product_id, position);
--> statement-breakpoint
CREATE INDEX product_images_product_position_idx ON product_images (product_id, position);
--> statement-breakpoint
CREATE INDEX reviews_product_status_idx ON reviews (product_id, status);
--> statement-breakpoint
CREATE INDEX shipping_rules_profile_wilaya_idx ON shipping_rules (profile_id, wilaya_id);
--> statement-breakpoint
CREATE INDEX shipping_profiles_store_default_idx ON shipping_profiles (store_id) WHERE is_default;
--> statement-breakpoint
CREATE INDEX communes_wilaya_idx ON communes (wilaya_id);
--> statement-breakpoint
CREATE INDEX carrier_communes_commune_idx ON carrier_communes (commune_id);
--> statement-breakpoint
CREATE INDEX company_shipments_order_idx ON company_shipments (order_id);
--> statement-breakpoint
CREATE INDEX activity_logs_store_actor_created_idx ON activity_logs (store_id, actor_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX activity_logs_store_entity_created_idx ON activity_logs (store_id, entity_type, created_at DESC);
--> statement-breakpoint
CREATE INDEX drivers_store_phone_idx ON drivers (store_id, phone);
--> statement-breakpoint
CREATE INDEX landing_pages_product_idx ON landing_pages (product_id);
--> statement-breakpoint
CREATE INDEX landing_pages_store_status_idx ON landing_pages (store_id, status);
--> statement-breakpoint
CREATE INDEX landing_page_images_lp_position_idx ON landing_page_images (landing_page_id, position);
