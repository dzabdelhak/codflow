ALTER TABLE "stores" ADD COLUMN "channel_type" text DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "unavailable_rule" text DEFAULT 'show_unavailable' NOT NULL;--> statement-breakpoint
CREATE FUNCTION main_product_available(channel text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_products cp JOIN products p ON p.id = cp.product_id
     WHERE cp.store_id = channel AND cp.published
       AND p.status = 'ACTIVE' AND p.visibility AND p.deleted_at IS NULL
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION add_to_current_channel() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  channel text := current_setting('app.store_id', true);
BEGIN
  IF channel IS NOT NULL AND channel <> ''
     AND NOT EXISTS (SELECT 1 FROM stores WHERE id = channel AND channel_type = 'landing') THEN
    INSERT INTO channel_products (store_id, product_id, position, created_at, updated_at)
    VALUES (
      channel,
      NEW.id,
      COALESCE((SELECT max(position) + 1 FROM channel_products WHERE store_id = channel), 0),
      NEW.created_at,
      NEW.updated_at
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION landing_single_product() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM stores WHERE id = NEW.store_id AND channel_type = 'landing' FOR NO KEY UPDATE;
  IF FOUND AND EXISTS (
    SELECT 1 FROM channel_products WHERE store_id = NEW.store_id AND product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'A landing channel sells one main product'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'landing_single_product';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER channel_products_landing_single BEFORE INSERT OR UPDATE OF product_id ON channel_products
  FOR EACH ROW EXECUTE FUNCTION landing_single_product();
