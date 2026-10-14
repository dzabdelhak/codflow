CREATE TABLE "channel_design_versions" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"published_at" text NOT NULL,
	"published_by" text,
	CONSTRAINT "channel_design_versions_store_id_version_pk" PRIMARY KEY("store_id","version")
);
--> statement-breakpoint
CREATE TABLE "channel_designs" (
	"store_id" text PRIMARY KEY DEFAULT current_setting('app.store_id') NOT NULL,
	"draft" jsonb,
	"draft_base_version" integer,
	"updated_at" text NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE channel_designs ADD CONSTRAINT channel_designs_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE channel_designs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE channel_designs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON channel_designs
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
--> statement-breakpoint
ALTER TABLE channel_design_versions ADD CONSTRAINT channel_design_versions_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE channel_design_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE channel_design_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY store_isolation ON channel_design_versions
  USING (store_id = current_setting('app.store_id', true))
  WITH CHECK (store_id = current_setting('app.store_id', true));
