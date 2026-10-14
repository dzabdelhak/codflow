CREATE FUNCTION codflow_json_text_array(value text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(value::jsonb)) END
$$;
--> statement-breakpoint
CREATE TABLE "oauthClientAssertions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauthClientResources" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp (3) DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauthResources" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	"created_at" timestamp (3) DEFAULT now(),
	"updated_at" timestamp (3) DEFAULT now(),
	CONSTRAINT "oauthResources_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" DROP CONSTRAINT "oauthAccessTokens_client_id_oauthClients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauthConsents" DROP CONSTRAINT "oauthConsents_client_id_oauthClients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" DROP CONSTRAINT "oauthRefreshTokens_client_id_oauthClients_client_id_fk";
--> statement-breakpoint
DROP INDEX "oauthRefreshTokens_token_idx";--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ALTER COLUMN "scopes" SET DATA TYPE text[] USING codflow_json_text_array("scopes");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "scopes" SET DATA TYPE text[] USING codflow_json_text_array("scopes");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "contacts" SET DATA TYPE text[] USING codflow_json_text_array("contacts");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "redirect_uris" SET DATA TYPE text[] USING codflow_json_text_array("redirect_uris");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "post_logout_redirect_uris" SET DATA TYPE text[] USING codflow_json_text_array("post_logout_redirect_uris");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "grant_types" SET DATA TYPE text[] USING codflow_json_text_array("grant_types");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "response_types" SET DATA TYPE text[] USING codflow_json_text_array("response_types");--> statement-breakpoint
ALTER TABLE "oauthClients" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "oauthConsents" ALTER COLUMN "scopes" SET DATA TYPE text[] USING codflow_json_text_array("scopes");--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ALTER COLUMN "scopes" SET DATA TYPE text[] USING codflow_json_text_array("scopes");--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD COLUMN "revoked" timestamp (3);--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "client_discovery_id" text;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "client_credentials_scopes" text[];--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "backchannel_logout_session_required" boolean;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "application_type" text;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "jwks_uri" text;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD COLUMN "dpop_bound_access_tokens" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "oauthConsents" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauthConsents" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "rotated_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "rotation_replay_response" text;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "rotation_replay_expires_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "oauthClientResources" ADD CONSTRAINT "oauthClientResources_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthClientResources" ADD CONSTRAINT "oauthClientResources_resource_id_oauthResources_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauthResources"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauthClientResources_client_resource_unique" ON "oauthClientResources" USING btree ("client_id","resource_id");--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD CONSTRAINT "oauthAccessTokens_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthConsents" ADD CONSTRAINT "oauthConsents_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD CONSTRAINT "oauthRefreshTokens_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD CONSTRAINT "oauthRefreshTokens_token_unique" UNIQUE("token");
--> statement-breakpoint
DROP FUNCTION codflow_json_text_array(text);
--> statement-breakpoint
REVOKE ALL ON "oauthClients", "oauthResources", "oauthClientResources", "oauthClientAssertions",
  "oauthRefreshTokens", "oauthAccessTokens", "oauthConsents" FROM codflow_app;
