ALTER TABLE "stores" ADD COLUMN "creation_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_merchant_creation_key_unique" ON "stores" USING btree ("merchant_id","creation_key");