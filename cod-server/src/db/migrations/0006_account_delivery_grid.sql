ALTER TABLE "merchants" ADD COLUMN "delivery_grid_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_grid_version" integer;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "default_shipping_profile_id" text;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_default_shipping_profile_id_shipping_profiles_id_fk" FOREIGN KEY ("default_shipping_profile_id") REFERENCES "public"."shipping_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipping_profiles', 'shipping_rules', 'shipping_rule_communes'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN merchant_id text', t);
    EXECUTE format('UPDATE %I x SET merchant_id = s.merchant_id FROM stores s WHERE s.id = x.store_id', t);
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE stores s SET default_shipping_profile_id = p.id
  FROM shipping_profiles p
 WHERE p.store_id = s.id AND p.is_default;
--> statement-breakpoint
WITH ranked AS (
  SELECT p.id, row_number() OVER (PARTITION BY p.merchant_id ORDER BY s.created_at, s.id, p.created_at, p.id) AS rn
    FROM shipping_profiles p JOIN stores s ON s.id = p.store_id
   WHERE p.is_default
)
UPDATE shipping_profiles p SET is_default = false FROM ranked r WHERE r.id = p.id AND r.rn > 1;
--> statement-breakpoint
UPDATE stores s SET default_shipping_profile_id = NULL
  FROM shipping_profiles p
 WHERE p.id = s.default_shipping_profile_id AND p.is_default;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipping_profiles', 'shipping_rules', 'shipping_rule_communes'] LOOP
    EXECUTE format('DROP POLICY store_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id SET NOT NULL', t);
    EXECUTE format($q$ALTER TABLE %I ALTER COLUMN merchant_id SET DEFAULT current_setting('app.merchant_id')$q$, t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE', t, t || '_merchant_fk');
    EXECUTE format($p$CREATE POLICY merchant_isolation ON %I
      USING (merchant_id = current_setting('app.merchant_id', true))
      WITH CHECK (merchant_id = current_setting('app.merchant_id', true))$p$, t);
    EXECUTE format('ALTER TABLE %I DROP COLUMN store_id', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX shipping_profiles_merchant_default_idx ON shipping_profiles (merchant_id) WHERE is_default;
--> statement-breakpoint
CREATE FUNCTION bump_delivery_grid_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE merchants SET delivery_grid_version = delivery_grid_version + 1
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.merchant_id ELSE NEW.merchant_id END;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shipping_profiles', 'shipping_rules', 'shipping_rule_communes'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bump_delivery_grid_version()', t || '_grid_version', t);
  END LOOP;
END $$;
