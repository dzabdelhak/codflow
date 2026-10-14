CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"store_id" text DEFAULT nullif(current_setting('app.store_id', true), ''),
	"payload" jsonb NOT NULL,
	"dedup_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
ALTER TABLE "store_pixel_config" ALTER COLUMN "pixel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ALTER COLUMN "access_token" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "utm_content" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "utm_term" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ttclid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fbclid" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ad_cookies" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_consent" boolean;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "tiktok_pixel_id" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "tiktok_access_token" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "tiktok_test_event_code" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "snap_pixel_id" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "snap_access_token" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "ga4_measurement_id" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "ga4_api_secret" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "google_ads_id" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "google_ads_label" text;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD COLUMN "consent_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("run_at") WHERE status in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "jobs_store_kind_idx" ON "jobs" USING btree ("store_id","kind","created_at");--> statement-breakpoint
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON jobs
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
