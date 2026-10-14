CREATE TABLE "aventy_sync_state" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"domain" text NOT NULL,
	"cursor" text,
	"synced_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aventy_sync_state_store_id_domain_pk" PRIMARY KEY("store_id","domain")
);
--> statement-breakpoint
CREATE TABLE "channel_aventy_keys" (
	"store_id" text PRIMARY KEY DEFAULT current_setting('app.store_id') NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_hint" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"status_detail" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "aventy_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "aventy_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_version" bigint;--> statement-breakpoint
ALTER TABLE "shipping_profiles" ADD COLUMN "aventy_store_id" text;--> statement-breakpoint
ALTER TABLE "shipping_profiles" ADD COLUMN "source_version" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_merchant_aventy_unique" ON "product_categories" USING btree ("merchant_id","aventy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_aventy_unique" ON "products" USING btree ("merchant_id","aventy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_profiles_aventy_store_unique" ON "shipping_profiles" USING btree ("aventy_store_id");--> statement-breakpoint
ALTER TABLE channel_aventy_keys ADD CONSTRAINT channel_aventy_keys_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE channel_aventy_keys ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE channel_aventy_keys FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON channel_aventy_keys
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
--> statement-breakpoint
ALTER TABLE aventy_sync_state ADD CONSTRAINT aventy_sync_state_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE aventy_sync_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE aventy_sync_state FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON aventy_sync_state
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
--> statement-breakpoint
ALTER TABLE shipping_profiles ADD CONSTRAINT shipping_profiles_aventy_store_fk FOREIGN KEY (aventy_store_id) REFERENCES stores(id) ON DELETE SET NULL;
