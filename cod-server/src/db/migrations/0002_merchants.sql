-- Merchants own stores and users (ticket 03). Platform data: request code
-- sees only its own merchant, through app.merchant_id set by the request
-- scope next to app.store_id.

CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"store_limit" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "merchant_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "merchant_id" text;
--> statement-breakpoint
-- Existing single-store data belongs to one default merchant.
INSERT INTO "merchants" ("id", "name", "created_at")
SELECT 'default-merchant', 'Default merchant', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE EXISTS (SELECT 1 FROM "stores") OR EXISTS (SELECT 1 FROM "users");
--> statement-breakpoint
UPDATE "stores" SET "merchant_id" = 'default-merchant' WHERE "merchant_id" IS NULL;
--> statement-breakpoint
UPDATE "users" SET "merchant_id" = 'default-merchant' WHERE "merchant_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "merchant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "merchant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "merchant_id" SET DEFAULT current_setting('app.merchant_id');
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "stores_merchant_idx" ON "stores" USING btree ("merchant_id");
--> statement-breakpoint
CREATE INDEX "users_merchant_idx" ON "users" USING btree ("merchant_id");
--> statement-breakpoint
-- Request code reads its own merchant; only the platform writes merchants.
REVOKE INSERT, UPDATE, DELETE ON merchants FROM codflow_app;
--> statement-breakpoint
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE merchants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY merchant_isolation ON merchants
  USING (id = current_setting('app.merchant_id', true));
--> statement-breakpoint
-- Users and their scopes are visible to their own merchant only.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY merchant_isolation ON users
  USING (merchant_id = current_setting('app.merchant_id', true))
  WITH CHECK (merchant_id = current_setting('app.merchant_id', true));
--> statement-breakpoint
ALTER TABLE user_scopes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_scopes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY merchant_isolation ON user_scopes
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = user_scopes.user_id))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = user_scopes.user_id));
--> statement-breakpoint
-- better-auth's credentials and sessions follow their user's merchant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts', 'sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY merchant_isolation ON %I
      USING (EXISTS (SELECT 1 FROM users u WHERE u.id = %I.user_id))
      WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = %I.user_id))$p$, t, t, t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Sign-in machinery request code never needs.
REVOKE ALL ON verifications, jwkss FROM codflow_app;
--> statement-breakpoint
-- A store never changes merchant from request code.
CREATE FUNCTION stores_keep_merchant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.merchant_id IS DISTINCT FROM OLD.merchant_id AND current_user = 'codflow_app' THEN
    RAISE EXCEPTION 'a store cannot change merchant';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stores_keep_merchant BEFORE UPDATE OF merchant_id ON stores
  FOR EACH ROW EXECUTE FUNCTION stores_keep_merchant();
