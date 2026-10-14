ALTER TABLE "outbound_orders" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "outbound_orders_attempted_idx" ON "outbound_orders" USING btree ("store_id","created_at","id") WHERE status = 'pending' and attempts > 0;--> statement-breakpoint
CREATE INDEX "outbound_orders_sent_at_idx" ON "outbound_orders" USING btree ("sent_at") WHERE status = 'sent';--> statement-breakpoint
UPDATE outbound_orders SET queued_at = created_at;
