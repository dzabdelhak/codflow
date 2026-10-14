CREATE TABLE "channel_products" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"product_id" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"shipping_profile_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "channel_products_store_id_product_id_pk" PRIMARY KEY("store_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "channel_products" ADD CONSTRAINT "channel_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_products" ADD CONSTRAINT "channel_products_shipping_profile_id_shipping_profiles_id_fk" FOREIGN KEY ("shipping_profile_id") REFERENCES "public"."shipping_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE channel_products ADD CONSTRAINT channel_products_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX channel_products_store_position_idx ON channel_products (store_id, position);
--> statement-breakpoint
ALTER TABLE channel_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE channel_products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON channel_products
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (
    store_id = current_setting('app.store_id', true)
    AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_id)
  );
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_categories', 'products', 'product_variants', 'product_images', 'stock_movements'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN merchant_id text', t);
    EXECUTE format('UPDATE %I x SET merchant_id = s.merchant_id FROM stores s WHERE s.id = x.store_id', t);
  END LOOP;
END $$;
--> statement-breakpoint
INSERT INTO channel_products (store_id, product_id, published, featured, position, shipping_profile_id, created_at, updated_at)
SELECT store_id, id, show_in_store, store_featured,
       row_number() OVER (PARTITION BY store_id ORDER BY store_featured DESC, created_at DESC, id) - 1,
       shipping_profile_id, created_at, updated_at
  FROM products;
--> statement-breakpoint
DO $$
DECLARE
  target text[];
  dup record;
  candidate text;
  candidate_free boolean;
  n int;
BEGIN
  FOREACH target SLICE 1 IN ARRAY ARRAY[
    ARRAY['products', 'handle'],
    ARRAY['products', 'sku'],
    ARRAY['product_variants', 'sku'],
    ARRAY['product_categories', 'slug']
  ] LOOP
    FOR dup IN EXECUTE format(
      'SELECT id, merchant_id, %2$I AS value FROM (
         SELECT id, merchant_id, %2$I, row_number() OVER (PARTITION BY merchant_id, %2$I ORDER BY created_at, id) AS rn
           FROM %1$I WHERE %2$I IS NOT NULL
       ) ranked WHERE rn > 1', target[1], target[2])
    LOOP
      n := 2;
      LOOP
        candidate := dup.value || '-' || n;
        EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM %1$I WHERE merchant_id = $1 AND %2$I = $2)', target[1], target[2])
          INTO STRICT candidate_free USING dup.merchant_id, candidate;
        EXIT WHEN candidate_free;
        n := n + 1;
      END LOOP;
      EXECUTE format('UPDATE %1$I SET %2$I = $1 WHERE id = $2', target[1], target[2]) USING candidate, dup.id;
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_shipping_profile_id_shipping_profiles_id_fk";
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_categories', 'products', 'product_variants', 'product_images', 'stock_movements'] LOOP
    EXECUTE format('DROP POLICY store_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN merchant_id SET NOT NULL', t);
    EXECUTE format($q$ALTER TABLE %I ALTER COLUMN merchant_id SET DEFAULT current_setting('app.merchant_id')$q$, t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE', t, t || '_merchant_fk');
    EXECUTE format($p$CREATE POLICY merchant_isolation ON %I
      USING (merchant_id = current_setting('app.merchant_id', true))
      WITH CHECK (merchant_id = current_setting('app.merchant_id', true))$p$, t);
  END LOOP;
END $$;
--> statement-breakpoint
DROP INDEX "product_categories_store_slug_unique";--> statement-breakpoint
DROP INDEX "product_variants_store_sku_unique";--> statement-breakpoint
DROP INDEX "products_store_handle_unique";--> statement-breakpoint
DROP INDEX "products_store_sku_unique";--> statement-breakpoint
ALTER TABLE "product_categories" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "product_images" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "product_variants" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "show_in_store";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "store_featured";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "shipping_profile_id";--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_merchant_slug_unique" ON "product_categories" USING btree ("merchant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_merchant_sku_unique" ON "product_variants" USING btree ("merchant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_handle_unique" ON "products" USING btree ("merchant_id","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_sku_unique" ON "products" USING btree ("merchant_id","sku");--> statement-breakpoint
CREATE INDEX products_merchant_created_idx ON products (merchant_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE FUNCTION bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_categories', 'products', 'product_variants', 'product_images'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION bump_version()', t || '_version', t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION add_to_current_channel() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  channel text := current_setting('app.store_id', true);
BEGIN
  IF channel IS NOT NULL AND channel <> '' THEN
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
CREATE TRIGGER products_add_to_current_channel AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION add_to_current_channel();
