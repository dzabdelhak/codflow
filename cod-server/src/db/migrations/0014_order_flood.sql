CREATE TABLE "blocked_order_attempts" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"order_number" text NOT NULL,
	"phone" text NOT NULL,
	"customer_name" text NOT NULL,
	"device_id" text,
	"ip_address" text,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_phones" (
	"merchant_id" text DEFAULT current_setting('app.merchant_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "order_limit_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
CREATE INDEX "blocked_order_attempts_store_created_idx" ON "blocked_order_attempts" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_phones_merchant_phone_unique" ON "blocked_phones" USING btree ("merchant_id","phone");--> statement-breakpoint
CREATE INDEX "orders_store_phone_created_idx" ON "orders" USING btree ("store_id","phone","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_device_created_idx" ON "orders" USING btree ("store_id","device_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_ip_created_idx" ON "orders" USING btree ("store_id","ip_address","created_at");--> statement-breakpoint
ALTER TABLE blocked_order_attempts ADD CONSTRAINT blocked_order_attempts_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE blocked_order_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blocked_order_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON blocked_order_attempts
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
--> statement-breakpoint
ALTER TABLE blocked_phones ADD CONSTRAINT blocked_phones_merchant_fk FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE blocked_phones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blocked_phones FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY merchant_isolation ON blocked_phones
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));
