ALTER TABLE "stores" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
UPDATE stores SET status = 'published' WHERE status = 'active';
--> statement-breakpoint
UPDATE stores SET status = 'suspended' WHERE status = 'inactive';
