CREATE TABLE "outbound_orders" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"aventy_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbound_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee_to_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stock_confirmed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "order_prefix" text DEFAULT 'CMD' NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "order_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_orders_due_idx" ON "outbound_orders" USING btree ("next_attempt_at","id") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE outbound_orders ADD CONSTRAINT outbound_orders_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE outbound_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbound_orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON outbound_orders
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
--> statement-breakpoint
-- Existing stores number their orders after their free subdomain.
UPDATE stores s SET order_prefix = p.prefix
FROM (
  SELECT DISTINCT ON (d.store_id) d.store_id,
         upper(left(regexp_replace(split_part(d.hostname, '.', 1), '[^a-zA-Z0-9]', '', 'g'), 8)) AS prefix
  FROM store_domains d WHERE d.kind = 'subdomain'
  ORDER BY d.store_id, d.created_at
) p
WHERE p.store_id = s.id AND p.prefix <> '';
