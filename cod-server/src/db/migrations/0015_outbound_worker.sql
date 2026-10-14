ALTER TABLE "outbound_orders" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "last_outcome" text;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "outcome_detail" jsonb;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "alerted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbound_orders_channel_line_idx" ON "outbound_orders" USING btree ("store_id","created_at","id") WHERE status = 'pending';