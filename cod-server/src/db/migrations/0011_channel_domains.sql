ALTER TABLE "store_domains" ADD COLUMN "status" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "verified_at" text;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "checked_at" text;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "store_domains" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE store_domains SET verified_at = created_at;--> statement-breakpoint
UPDATE store_domains d SET is_primary = true
  FROM (
    SELECT DISTINCT ON (store_id) hostname
      FROM store_domains
     ORDER BY store_id, (kind = 'subdomain') DESC, created_at, hostname
  ) first
 WHERE d.hostname = first.hostname;--> statement-breakpoint
CREATE UNIQUE INDEX "store_domains_one_primary" ON "store_domains" USING btree ("store_id") WHERE "store_domains"."is_primary";