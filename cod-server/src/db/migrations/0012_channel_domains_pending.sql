ALTER TABLE "store_domains" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
UPDATE stores s SET domain = d.hostname
  FROM store_domains d
 WHERE d.store_id = s.id AND d.is_primary AND s.domain IS DISTINCT FROM d.hostname;
