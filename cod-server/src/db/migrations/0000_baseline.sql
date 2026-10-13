CREATE TABLE "abandoned_orders" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"wilaya_id" integer,
	"commune_id" text,
	"wilaya_name" text,
	"commune_name" text,
	"product_id" text,
	"product_name" text,
	"variant_id" text,
	"variant_label" text,
	"price" double precision,
	"items_json" text,
	"item_count" integer,
	"delivery_type" text,
	"fbc" text,
	"fbp" text,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"converted_order_id" text,
	"converted_order_number" text,
	"recovery_attempts" integer DEFAULT 0 NOT NULL,
	"last_recovery_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "abandoned_orders_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3),
	"refresh_token_expires_at" timestamp (3),
	"scope" text,
	"password" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text,
	"metadata" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capi_event_log" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"event_name" text NOT NULL,
	"stage" text DEFAULT 'delivered' NOT NULL,
	"status" text NOT NULL,
	"pixel_id" text,
	"meta_event_id" text,
	"error" text,
	"sent_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carrier_communes" (
	"carrier_code" text NOT NULL,
	"commune_id" text NOT NULL,
	"carrier_name" text NOT NULL,
	CONSTRAINT "carrier_communes_carrier_code_commune_id_pk" PRIMARY KEY("carrier_code","commune_id")
);
--> statement-breakpoint
CREATE TABLE "carrier_wilayas" (
	"carrier_code" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"carrier_name" text NOT NULL,
	CONSTRAINT "carrier_wilayas_carrier_code_wilaya_id_pk" PRIMARY KEY("carrier_code","wilaya_id")
);
--> statement-breakpoint
CREATE TABLE "communes" (
	"id" text PRIMARY KEY NOT NULL,
	"wilaya_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"postal_code" text
);
--> statement-breakpoint
CREATE TABLE "company_api_logs" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"order_id" text,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_body" text,
	"http_status" integer,
	"response_body" text,
	"success" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_shipments" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"company_id" text NOT NULL,
	"tracking_number" text NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"label_url" text,
	"raw_response" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_stop_desks" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"commune" text,
	"wilaya_id" integer,
	"address" text,
	"phones" text,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_group_members" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"group_id" text NOT NULL,
	"assigned_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tag_assignments" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"assigned_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tags" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"assignment_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone2" text,
	"wilaya_id" integer,
	"commune_id" text,
	"wilaya" text NOT NULL,
	"commune" text,
	"address" text,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_spent" double precision DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"last_order_at" text
);
--> statement-breakpoint
CREATE TABLE "dashboard_brand" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"brand_name" text DEFAULT 'Dashboard' NOT NULL,
	"logo_url" text,
	"primary_color" text DEFAULT '#7c3aed' NOT NULL,
	"meta_title" text,
	"favicon_url" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_companies" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL,
	"code" text NOT NULL,
	"website" text,
	"active" boolean DEFAULT true NOT NULL,
	"api_endpoint" text,
	"api_token" text,
	"api_user_guid" text,
	"supports_home_delivery" boolean DEFAULT true NOT NULL,
	"supports_stop_desk" boolean DEFAULT true NOT NULL,
	"supports_tracking" boolean DEFAULT false NOT NULL,
	"webhook_secret" text,
	"webhook_endpoint_id" text,
	"webhook_status_mapping" text,
	"auto_validate" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_compensations" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"fee_per_delivery" double precision DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_payments" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" double precision NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"phone2" text,
	"vehicle_type" text,
	"status" text DEFAULT 'available' NOT NULL,
	"total_delivered" integer DEFAULT 0 NOT NULL,
	"total_earnings" double precision DEFAULT 0 NOT NULL,
	"pending_cash" double precision DEFAULT 0 NOT NULL,
	"total_paid" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwkss" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3),
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "landing_page_images" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"landing_page_id" text NOT NULL,
	"r2_key" text NOT NULL,
	"src" text NOT NULL,
	"alt_text" text,
	"source" text DEFAULT 'upload' NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_pixel_config" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"landing_page_id" text NOT NULL,
	"pixel_id" text NOT NULL,
	"ad_account_name" text,
	"access_token" text NOT NULL,
	"test_event_code" text,
	"conversion_event" text DEFAULT 'Purchase' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "landing_page_pixel_config_landing_page_id_unique" UNIQUE("landing_page_id")
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"product_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"image_gap" integer DEFAULT 0 NOT NULL,
	"side_padding" integer DEFAULT 0 NOT NULL,
	"content_max_width" integer DEFAULT 0 NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauthAccessTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"scopes" text NOT NULL,
	CONSTRAINT "oauthAccessTokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauthClients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text,
	"user_id" text,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text,
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text NOT NULL,
	"post_logout_redirect_uris" text,
	"token_endpoint_auth_method" text,
	"grant_types" text,
	"response_types" text,
	"type" text,
	"public" boolean,
	"client_id_issued_at" timestamp (3),
	"client_secret_expires_at" timestamp (3),
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "oauthClients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauthConsents" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauthRefreshTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"revoked" timestamp (3),
	"auth_time" timestamp (3),
	"scopes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger_product_id" text NOT NULL,
	"trigger_variant_id" text,
	"trigger_quantity" integer DEFAULT 2 NOT NULL,
	"reward_product_id" text,
	"reward_variant_id" text,
	"reward_quantity" integer DEFAULT 1 NOT NULL,
	"discount_type" text DEFAULT 'free' NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_assignments" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"assignee_type" text NOT NULL,
	"assignee_id" text NOT NULL,
	"assignee_name" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" text NOT NULL,
	"unassigned_at" text,
	"reason" text,
	"accepted_at" text,
	"pickup_at" text,
	"delivered_at" text,
	"status" text DEFAULT 'assigned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_products" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_id" text,
	"variant_label" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"price_per_unit" double precision NOT NULL,
	"line_total" double precision NOT NULL,
	"status" text DEFAULT 'fulfilled' NOT NULL,
	"returned_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"timestamp" text NOT NULL,
	"by" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"wilaya_id" integer,
	"commune_id" text,
	"city" text,
	"address" text,
	"price" double precision NOT NULL,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"order_type" text DEFAULT 'online' NOT NULL,
	"delivery_method" text DEFAULT 'unassigned' NOT NULL,
	"driver_id" text,
	"company_id" text,
	"assigned_at" text,
	"assigned_by" text,
	"assignment_notes" text,
	"tracking_number" text,
	"tracking_url" text,
	"external_order_id" text,
	"delivery_type" text DEFAULT 'home' NOT NULL,
	"station_code" text,
	"delivery_fee" double precision DEFAULT 0 NOT NULL,
	"driver_fee" double precision DEFAULT 0 NOT NULL,
	"cod_amount" double precision DEFAULT 0 NOT NULL,
	"weight" double precision,
	"is_fragile" boolean,
	"pickup_time" text,
	"delivery_time" text,
	"delivery_attempts" integer DEFAULT 0,
	"photos" text,
	"cod_payment_id" text,
	"fee_payment_id" text,
	"fbc" text,
	"fbp" text,
	"ip_address" text,
	"user_agent" text,
	"landing_page_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"customer_email" text,
	"custom_fields_json" text
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"parent_id" text,
	"image_url" text,
	"meta_title" text,
	"meta_description" text,
	"meta_keywords" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"src" text NOT NULL,
	"r2_key" text,
	"src_sm" text,
	"src_md" text,
	"src_lg" text,
	"alt_text" text,
	"width" integer,
	"height" integer,
	"type" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"variations" text NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"sku" text NOT NULL,
	"barcode" text,
	"inventory" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"weight_kg" double precision,
	"image_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"description_format" text DEFAULT 'text' NOT NULL,
	"handle" text NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"price" integer NOT NULL,
	"compare_at_price" integer,
	"cost_price" integer,
	"type" text DEFAULT 'PHYSICAL' NOT NULL,
	"has_variants" boolean DEFAULT false NOT NULL,
	"variant_options" text,
	"sku" text,
	"inventory" integer DEFAULT 0 NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"category_id" text,
	"tags" text,
	"visibility" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"show_in_store" boolean DEFAULT true NOT NULL,
	"store_featured" boolean DEFAULT false NOT NULL,
	"deleted_at" text,
	"published_at" text,
	"shipping_profile_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"product_id" text NOT NULL,
	"order_id" text NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shipping_profiles" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rule_communes" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"commune_id" text NOT NULL,
	"home_enabled" boolean,
	"stop_desk_enabled" boolean,
	"home_price" double precision,
	"stop_desk_price" double precision
);
--> statement-breakpoint
CREATE TABLE "shipping_rules" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"home_price" double precision DEFAULT 0 NOT NULL,
	"stop_desk_price" double precision DEFAULT 0 NOT NULL,
	"home_enabled" boolean DEFAULT true NOT NULL,
	"stop_desk_enabled" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"type" text NOT NULL,
	"delta" integer NOT NULL,
	"qty_before" integer NOT NULL,
	"qty_after" integer NOT NULL,
	"reason" text,
	"reference" text,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"name" text DEFAULT 'default' NOT NULL,
	"last_used_at" text,
	"created_at" text NOT NULL,
	CONSTRAINT "store_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "store_domains" (
	"hostname" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_email_config" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"api_key" text NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "store_email_config_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "store_legal_profile" (
	"store_id" text PRIMARY KEY NOT NULL,
	"legal_name" text,
	"rc_number" text,
	"nif" text,
	"address" text,
	"contact_email" text,
	"contact_phone" text,
	"return_window_days" integer DEFAULT 0 NOT NULL,
	"delivery_min_days" integer DEFAULT 2 NOT NULL,
	"delivery_max_days" integer DEFAULT 7 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_otp_config" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"api_key" text NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "store_otp_config_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "store_page_translations" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"page_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"body_plain" text NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"source" text DEFAULT 'template' NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "store_page_translations_page_id_locale_pk" PRIMARY KEY("page_id","locale")
);
--> statement-breakpoint
CREATE TABLE "store_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"show_in_footer" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"template_version" integer,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_pixel_config" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"pixel_id" text NOT NULL,
	"ad_account_name" text,
	"access_token" text NOT NULL,
	"test_event_code" text,
	"conversion_event" text DEFAULT 'Purchase' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"per_page_tracking_enabled" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "store_pixel_config_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "store_turnstile_config" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"site_key" text NOT NULL,
	"secret_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "store_turnstile_config_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"logo_url" text,
	"theme_id" text DEFAULT 'theme01' NOT NULL,
	"primary_color" text DEFAULT '#7c3aed' NOT NULL,
	"accent_color" text DEFAULT '#f59e0b' NOT NULL,
	"bg_color" text DEFAULT '#f8f8f8' NOT NULL,
	"font_family" text DEFAULT 'Cairo, sans-serif' NOT NULL,
	"font_url" text,
	"lang" text DEFAULT 'ar' NOT NULL,
	"currency" text DEFAULT 'DZD' NOT NULL,
	"currency_symbol" text DEFAULT 'دج' NOT NULL,
	"content_json" text,
	"meta_title" text,
	"meta_description" text,
	"og_image" text,
	"announcement_bar" text,
	"reviews_enabled" boolean DEFAULT true NOT NULL,
	"cart_enabled" boolean DEFAULT false NOT NULL,
	"free_shipping_threshold" integer,
	"cart_shipping_mode" text DEFAULT 'highest' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"store_api_key" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"checkout_form_json" text,
	"whatsapp_widget_json" text
);
--> statement-breakpoint
CREATE TABLE "user_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"granted_by" text,
	"granted_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"api_key" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"store_id" text DEFAULT current_setting('app.store_id') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"company_id" text NOT NULL,
	"order_id" text,
	"tracking" text,
	"event_type" text NOT NULL,
	"raw_payload" text NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"new_status" text,
	"reason" text,
	"error_msg" text,
	"processed_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wilayas" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abandoned_orders" ADD CONSTRAINT "abandoned_orders_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_orders" ADD CONSTRAINT "abandoned_orders_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capi_event_log" ADD CONSTRAINT "capi_event_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_communes" ADD CONSTRAINT "carrier_communes_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_wilayas" ADD CONSTRAINT "carrier_wilayas_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_api_logs" ADD CONSTRAINT "company_api_logs_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_api_logs" ADD CONSTRAINT "company_api_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_shipments" ADD CONSTRAINT "company_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_shipments" ADD CONSTRAINT "company_shipments_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stop_desks" ADD CONSTRAINT "company_stop_desks_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_stop_desks" ADD CONSTRAINT "company_stop_desks_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "customer_tag_assignments_tag_id_customer_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."customer_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_compensations" ADD CONSTRAINT "driver_compensations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_compensations" ADD CONSTRAINT "driver_compensations_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_images" ADD CONSTRAINT "landing_page_images_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_pixel_config" ADD CONSTRAINT "landing_page_pixel_config_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD CONSTRAINT "oauthAccessTokens_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD CONSTRAINT "oauthAccessTokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD CONSTRAINT "oauthAccessTokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthAccessTokens" ADD CONSTRAINT "oauthAccessTokens_refresh_id_oauthRefreshTokens_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauthRefreshTokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthClients" ADD CONSTRAINT "oauthClients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthConsents" ADD CONSTRAINT "oauthConsents_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthConsents" ADD CONSTRAINT "oauthConsents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD CONSTRAINT "oauthRefreshTokens_client_id_oauthClients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauthClients"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD CONSTRAINT "oauthRefreshTokens_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauthRefreshTokens" ADD CONSTRAINT "oauthRefreshTokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_trigger_product_id_products_id_fk" FOREIGN KEY ("trigger_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_trigger_variant_id_product_variants_id_fk" FOREIGN KEY ("trigger_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_reward_product_id_products_id_fk" FOREIGN KEY ("reward_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_reward_variant_id_product_variants_id_fk" FOREIGN KEY ("reward_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_shipping_profile_id_shipping_profiles_id_fk" FOREIGN KEY ("shipping_profile_id") REFERENCES "public"."shipping_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rule_communes" ADD CONSTRAINT "shipping_rule_communes_rule_id_shipping_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."shipping_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rule_communes" ADD CONSTRAINT "shipping_rule_communes_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_profile_id_shipping_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."shipping_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_api_keys" ADD CONSTRAINT "store_api_keys_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_email_config" ADD CONSTRAINT "store_email_config_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_legal_profile" ADD CONSTRAINT "store_legal_profile_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_otp_config" ADD CONSTRAINT "store_otp_config_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_page_translations" ADD CONSTRAINT "store_page_translations_page_id_store_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."store_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_pages" ADD CONSTRAINT "store_pages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_pixel_config" ADD CONSTRAINT "store_pixel_config_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_turnstile_config" ADD CONSTRAINT "store_turnstile_config_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scopes" ADD CONSTRAINT "user_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abandoned_orders_status_idx" ON "abandoned_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "abandoned_orders_phone_idx" ON "abandoned_orders" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "abandoned_orders_created_at_idx" ON "abandoned_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_capi_event_log_order" ON "capi_event_log" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_capi_event_log_claim" ON "capi_event_log" USING btree ("order_id","stage","event_name");--> statement-breakpoint
CREATE UNIQUE INDEX "company_stop_desks_company_code_unique" ON "company_stop_desks" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_members_customer_group_unique" ON "customer_group_members" USING btree ("customer_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tag_assignments_customer_tag_unique" ON "customer_tag_assignments" USING btree ("customer_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_tags_store_name_unique" ON "customer_tags" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_store_phone_unique" ON "customers" USING btree ("store_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_companies_store_code_unique" ON "delivery_companies" USING btree ("store_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_compensations_driver_wilaya_unique" ON "driver_compensations" USING btree ("driver_id","wilaya_id");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_store_slug_unique" ON "landing_pages" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "oauthAccessTokens_user_id_idx" ON "oauthAccessTokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthAccessTokens_client_id_idx" ON "oauthAccessTokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthClients_user_id_idx" ON "oauthClients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthConsents_user_client_idx" ON "oauthConsents" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshTokens_token_idx" ON "oauthRefreshTokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "oauthRefreshTokens_user_id_idx" ON "oauthRefreshTokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthRefreshTokens_client_id_idx" ON "oauthRefreshTokens" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_order_number_unique" ON "orders" USING btree ("store_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_store_slug_unique" ON "product_categories" USING btree ("store_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_sku_unique" ON "product_variants" USING btree ("store_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_handle_unique" ON "products" USING btree ("store_id","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_sku_unique" ON "products" USING btree ("store_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_unique" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_rule_communes_unique" ON "shipping_rule_communes" USING btree ("rule_id","commune_id");--> statement-breakpoint
CREATE INDEX "store_domains_store_idx" ON "store_domains" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_store_pages_slug" ON "store_pages" USING btree ("store_id","slug");--> statement-breakpoint
CREATE INDEX "idx_store_pages_footer" ON "store_pages" USING btree ("store_id","status","position");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","event_id");