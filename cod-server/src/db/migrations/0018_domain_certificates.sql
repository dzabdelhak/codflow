ALTER TABLE "store_domains" ADD COLUMN "certificate_status" text;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "certificate_checked_at" text;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "certificate_error" text;