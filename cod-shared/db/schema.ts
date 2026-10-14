import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { CHANNEL_STATUSES } from "../channels/lifecycle";
import { CHANNEL_TYPES, UNAVAILABLE_RULES } from "../channels/types";
import { sql } from "drizzle-orm";

/**
 * The channel (store) a row belongs to. Filled from the request's current
 * store, so inserts never pass it; Row-Level Security filters every read and
 * write on it (see the multi-store migration).
 */
const storeIdColumn = () =>
  text("store_id").notNull().default(sql`current_setting('app.store_id')`);

const merchantIdColumn = () =>
  text("merchant_id").notNull().default(sql`current_setting('app.merchant_id')`);

const versionColumn = () => integer("version").notNull().default(1);

const authNow = sql`now()`;

/**
 * The merchant account (Aventy's account, later): owns its stores and its
 * users. Platform data — outside Row-Level Security.
 */
export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Most stores this merchant may have; null = no limit. The plan check reads it (see cod-server/src/platform/plan-policy.ts). */
  storeLimit: integer("store_limit"),
  createdAt: text("created_at").notNull(),
  deliveryGridVersion: integer("delivery_grid_version").notNull().default(1),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["admin", "staff"] })
    .notNull()
    .default("staff"),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  /** UI language preference for emails: "ar" | "en" */
  language: text("language").notNull().default("en"),
  /**
   * The merchant this user works for; they can open every store of it. Filled
   * from the request's merchant like store_id. Last: mock-db fixtures are positional.
   */
  merchantId: text("merchant_id")
    .notNull()
    .default(sql`current_setting('app.merchant_id')`)
    .references(() => merchants.id),
}, (t) => ({
  merchantIdx: index("users_merchant_idx").on(t.merchantId),
}));

export const userScopes = pgTable("user_scopes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  grantedBy: text("granted_by"),
  grantedAt: text("granted_at").notNull(),
});

export const customers = pgTable("customers", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  phone2: text("phone2"),
  /** Wilaya FK — authority for wilaya. Kept in sync with `wilaya` text column. */
  wilayaId: integer("wilaya_id").references(() => wilayas.id),
  /** Commune FK — authority for commune. Kept in sync with `commune` text column. */
  communeId: text("commune_id").references(() => communes.id),
  wilaya: text("wilaya").notNull(),
  commune: text("commune"),
  address: text("address"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpent: doublePrecision("total_spent").notNull().default(0),
  createdAt: text("created_at").notNull(),
  lastOrderAt: text("last_order_at"),
}, (t) => ({
  phonePerStore: uniqueIndex("customers_store_phone_unique").on(t.storeId, t.phone),
}));

// ─── Customer Groups ──────────────────────────────────────────────────────────

/**
 * Named customer segments (e.g. "VIP", "Wholesale", "Problematic").
 * Customers are linked via customer_group_members.
 */
export const customerGroups = pgTable("customer_groups", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Hex color for UI display, e.g. "#6366f1" */
  color: text("color").notNull().default("#6366f1"),
  /** Denormalised count — incremented/decremented on member add/remove. */
  memberCount: integer("member_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Junction table linking customers to groups.
 * A customer can belong to multiple groups.
 */
export const customerGroupMembers = pgTable("customer_group_members", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => customerGroups.id, { onDelete: "cascade" }),
  assignedAt: text("assigned_at").notNull(),
}, (t) => ({
  customerGroupUnique: uniqueIndex("customer_group_members_customer_group_unique").on(t.customerId, t.groupId),
}));

/**
 * Named labels for customers (e.g. "vip", "returner", "wholesale").
 * Lighter than groups — no description, just name + color.
 * assignmentCount is denormalised for fast display.
 */
export const customerTags = pgTable("customer_tags", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#64748b"),
  assignmentCount: integer("assignment_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  namePerStore: uniqueIndex("customer_tags_store_name_unique").on(t.storeId, t.name),
}));

/**
 * Junction table linking customers to tags.
 * A customer can have multiple tags.
 */
export const customerTagAssignments = pgTable("customer_tag_assignments", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  tagId: text("tag_id")
    .notNull()
    .references(() => customerTags.id, { onDelete: "cascade" }),
  assignedAt: text("assigned_at").notNull(),
}, (t) => ({
  customerTagUnique: uniqueIndex("customer_tag_assignments_customer_tag_unique").on(t.customerId, t.tagId),
}));

// ─── Algeria Reference Data ───────────────────────────────────────────────────

/**
 * Algeria's 58 official wilayas.
 * Integer PK matches the official wilaya number (1–58) used by logistics APIs
 * like NOEST, Yalidine, and ZR Express.
 */
export const wilayas = pgTable("wilayas", {
  id: integer("id").primaryKey(), // Official wilaya number 1-58
  name: text("name").notNull(),   // "Alger"
  nameAr: text("name_ar").notNull(), // "الجزائر"
});

/**
 * Communes (municipalities) within each wilaya.
 * Seeded with major communes; postal codes for stop-desk lookups.
 */
export const communes = pgTable("communes", {
  id: text("id").primaryKey(),
  wilayaId: integer("wilaya_id")
    .notNull()
    .references(() => wilayas.id),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  postalCode: text("postal_code"),
});

// ─── Carrier geo names ─────────────────────────────────────────────────────────

/**
 * Per-carrier exact wilaya name strings. Carriers that match addresses by
 * name (Yalidine) reject parcels whose strings differ from their own
 * spellings; these rows carry the carrier's exact string for our wilaya IDs.
 * Carriers absent here keep the reference-table name.
 */
export const carrierWilayas = pgTable("carrier_wilayas", {
  carrierCode: text("carrier_code").notNull(),
  wilayaId: integer("wilaya_id")
    .notNull()
    .references(() => wilayas.id),
  carrierName: text("carrier_name").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.carrierCode, t.wilayaId] }),
}));

/** Same contract as carrier_wilayas, one level down. */
export const carrierCommunes = pgTable("carrier_communes", {
  carrierCode: text("carrier_code").notNull(),
  communeId: text("commune_id")
    .notNull()
    .references(() => communes.id),
  carrierName: text("carrier_name").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.carrierCode, t.communeId] }),
}));

// ─── Shipping Profiles ────────────────────────────────────────────────────────

/**
 * Customer shipping rate cards.
 *
 * Defines what the CUSTOMER pays (deliveryFee on orders) per wilaya/commune.
 * Used by: store default (isDefault=true) and product-level overrides
 * (products.shippingProfileId). Drivers and delivery companies do NOT
 * reference these profiles — driver pay lives in driver_compensations.
 */
export const shippingProfiles = pgTable("shipping_profiles", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** When true, rates from this profile are auto-applied on order creation. */
  isDefault: boolean("is_default").notNull().default(false),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-wilaya customer delivery rates within a shipping profile.
 *
 * homePrice/stopDeskPrice = what the customer pays for home / stop-desk delivery.
 * homeEnabled / stopDeskEnabled control whether orders can be placed for this
 * wilaya in that delivery mode. Defaults: home=true (open), stopDesk=false
 * (must be explicitly enabled once a carrier with stop desks is connected).
 *
 * Commune-level price + availability overrides live in shipping_rule_communes
 * (sparse — only exceptions; NULL = inherit from wilaya rule).
 *
 * Driver payroll is NOT stored here — see driver_compensations.
 */
export const shippingRules = pgTable("shipping_rules", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  profileId: text("profile_id")
    .notNull()
    .references(() => shippingProfiles.id, { onDelete: "cascade" }),
  wilayaId: integer("wilaya_id")
    .notNull()
    .references(() => wilayas.id),
  homePrice: doublePrecision("home_price").notNull().default(0),
  stopDeskPrice: doublePrecision("stop_desk_price").notNull().default(0),
  /** Whether home delivery is offered to this wilaya under this profile. */
  homeEnabled: boolean("home_enabled").notNull().default(true),
  /** Whether stop-desk pickup is offered to this wilaya under this profile. */
  stopDeskEnabled: boolean("stop_desk_enabled").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/**
 * Commune-level delivery mode + price overrides within a shipping rule.
 *
 * SPARSE table — only rows where a commune differs from its wilaya rule default.
 * NULL in any column = "inherit from the wilaya rule".
 *
 * Resolution logic:
 *   effective.homeEnabled     = commune.homeEnabled     ?? wilayaRule.homeEnabled
 *   effective.stopDeskEnabled = commune.stopDeskEnabled ?? wilayaRule.stopDeskEnabled
 *   effective.homePrice       = commune.homePrice       ?? wilayaRule.homePrice
 *   effective.stopDeskPrice   = commune.stopDeskPrice   ?? wilayaRule.stopDeskPrice
 */
export const shippingRuleCommunes = pgTable("shipping_rule_communes", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => shippingRules.id, { onDelete: "cascade" }),
  communeId: text("commune_id")
    .notNull()
    .references(() => communes.id, { onDelete: "cascade" }),
  /** null = inherit from wilaya rule. */
  homeEnabled: boolean("home_enabled"),
  /** null = inherit from wilaya rule. */
  stopDeskEnabled: boolean("stop_desk_enabled"),
  /** null = inherit price from wilaya rule. */
  homePrice: doublePrecision("home_price"),
  /** null = inherit price from wilaya rule. */
  stopDeskPrice: doublePrecision("stop_desk_price"),
}, (t) => ({
  ruleCommuneUnique: uniqueIndex("shipping_rule_communes_unique").on(t.ruleId, t.communeId),
}));

// ─── Drivers ─────────────────────────────────────────────────────────────────

/**
 * In-house delivery drivers managed by the store.
 * Per-wilaya payroll lives in driver_compensations — what the driver earns
 * per delivery in each wilaya (independent of what the customer was charged).
 */
export const drivers = pgTable("drivers", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  phone2: text("phone2"),
  vehicleType: text("vehicle_type", { enum: ["motorcycle", "car", "van"] }),
  status: text("status", { enum: ["available", "busy", "inactive"] })
    .notNull()
    .default("available"),
  /** Cumulative deliveries completed (incremented on status → delivered). */
  totalDelivered: integer("total_delivered").notNull().default(0),
  /** Cumulative delivery fees earned (incremented on status → delivered). */
  totalEarnings: doublePrecision("total_earnings").notNull().default(0),
  /** COD cash collected by driver but not yet remitted to the business. */
  pendingCash: doublePrecision("pending_cash").notNull().default(0),
  /** Total COD cash remitted to the business. */
  totalPaid: doublePrecision("total_paid").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Driver payroll: per-wilaya delivery fee the store pays the driver.
 *
 * Completely independent of what the customer was charged (shipping_rules).
 * When a driver is assigned to an order, the system looks up the matching
 * (driverId, wilayaId) row here to set orders.driverFee.
 *
 * Sparse: no row = the store doesn't pay this driver for deliveries in that wilaya
 * (assignment still works with driverFee = 0; admin should fill the row).
 */
export const driverCompensations = pgTable("driver_compensations", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  driverId: text("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
  wilayaId: integer("wilaya_id")
    .notNull()
    .references(() => wilayas.id),
  /** What the store pays this driver per delivery in this wilaya. */
  feePerDelivery: doublePrecision("fee_per_delivery").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  driverWilayaUnique: uniqueIndex("driver_compensations_driver_wilaya_unique").on(t.driverId, t.wilayaId),
}));

// ─── Driver Payments ─────────────────────────────────────────────────────────

/**
 * Tracks COD remittances and fee payments for in-house drivers.
 * Each record represents one payment event (settled for a batch of orders).
 * Types:
 *   cod_remittance  — driver hands collected COD cash back to shop
 *   fee_payment     — shop pays driver his earned delivery fees
 *   net_settlement  — hybrid: driver hands (COD − fees) net; both settled together
 */
export const driverPayments = pgTable("driver_payments", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  driverId: text("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["cod_remittance", "fee_payment", "net_settlement"],
  }).notNull(),
  /** Settled amount (COD total, fee total, or net COD−fees depending on type). */
  amount: doublePrecision("amount").notNull(),
  /** Number of orders included in this payment batch. */
  orderCount: integer("order_count").notNull().default(0),
  notes: text("notes"),
  /** User ID of the team member who recorded this payment. */
  createdBy: text("created_by").notNull(),
  /** Denormalised display name for audit trail. */
  createdByName: text("created_by_name").notNull(),
  createdAt: text("created_at").notNull(),
});

// ─── Delivery Companies ───────────────────────────────────────────────────────

/**
 * Third-party delivery companies (Yalidine, NOEST, ZR Express, etc.).
 *
 * Stores API credentials + capabilities only — no pricing. What the customer
 * pays always comes from shipping_rules; what the store pays the carrier is
 * whatever the carrier invoices out-of-band.
 */
export const deliveryCompanies = pgTable("delivery_companies", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),       // "Yalidine"
  nameAr: text("name_ar").notNull(),  // "ياليدين"
  /** Short unique code used in API calls and display. e.g. "yalidine" */
  code: text("code").notNull(),
  website: text("website"),
  active: boolean("active").notNull().default(true),

  // ── API Integration ──────────────────────────────────────────────────────
  /** Base URL of the company's REST API. */
  apiEndpoint: text("api_endpoint"),
  /** Bearer token or API key for authentication. */
  apiToken: text("api_token"),
  /** NOEST-specific user GUID required for shipment creation. */
  apiUserGuid: text("api_user_guid"),

  // ── Capabilities ─────────────────────────────────────────────────────────
  supportsHomeDelivery: boolean("supports_home_delivery")
    .notNull()
    .default(true),
  supportsStopDesk: boolean("supports_stop_desk")
    .notNull()
    .default(true),
  supportsTracking: boolean("supports_tracking")
    .notNull()
    .default(false),

  // ── Webhook Integration ───────────────────────────────────────────────────
  /**
   * ZR Express: "whsec_xxx" Svix secret fetched from ZR webhook endpoint API.
   * Yalidine: secret key from Yalidine Webhooks Dashboard.
   * null = signature verification skipped (warn in logs).
   */
  webhookSecret: text("webhook_secret"),
  /**
   * ZR Express only: registered endpoint UUID returned by ZR webhook registration API.
   * Used for unregister calls. null for Yalidine (manual setup, no endpoint ID).
   */
  webhookEndpointId: text("webhook_endpoint_id"),
  /**
   * ZR Express only: custom state name → our status mapping stored as JSON.
   * Format: { ourStatus: [zrStateName, ...] }
   * null = use code defaults only. null for Yalidine (statuses are hardcoded).
   */
  webhookStatusMapping: text("webhook_status_mapping"),

  /**
   * If true, our dispatcher calls valid/order immediately after create/order (default).
   * If false, the team must manually validate via POST /orders/:id/validate-shipment.
   * Set false for Packers (ecotrack) — team controls when parcel enters courier flow.
   */
  autoValidate: boolean("auto_validate").notNull().default(true),

  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  codePerStore: uniqueIndex("delivery_companies_store_code_unique").on(t.storeId, t.code),
}));

// ─── Orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable("orders", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  /** Wilaya ID (integer 1-58) — authority for wilaya. Names derived at query/dispatch time. */
  wilayaId: integer("wilaya_id").references(() => wilayas.id),
  /** Commune FK — authority for commune. Names derived at query/dispatch time. */
  communeId: text("commune_id").references(() => communes.id),
  city: text("city"),
  address: text("address"),
  price: doublePrecision("price").notNull(),
  notes: text("notes"),
  status: text("status", {
    enum: [
      "new",
      "confirmed",
      "unreachable",
      "preparing",
      "ready",
      "assigned",
      "dispatched",
      "out_for_delivery",
      "delivered",
      "returned",
      "cancelled",
    ],
  }).notNull().default("new"),
  orderType: text("order_type", { enum: ["online", "offline"] })
    .notNull()
    .default("online"),

  // ── Delivery assignment ──────────────────────────────────────────────────
  /**
   * "unassigned" at creation — the customer only picks a price tier; the admin
   * later picks how to fulfil (driver vs company). Writes to driver/company
   * assignment endpoints flip this automatically.
   */
  deliveryMethod: text("delivery_method", { enum: ["unassigned", "driver", "company"] })
    .notNull()
    .default("unassigned"),
  driverId: text("driver_id").references(() => drivers.id),
  companyId: text("company_id").references(() => deliveryCompanies.id),

  assignedAt: text("assigned_at"),
  assignedBy: text("assigned_by"),
  assignmentNotes: text("assignment_notes"),

  // ── Tracking ─────────────────────────────────────────────────────────────
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  externalOrderId: text("external_order_id"),

  // ── Delivery specifics ────────────────────────────────────────────────────
  deliveryType: text("delivery_type", { enum: ["home", "stop_desk"] })
    .notNull()
    .default("home"),
  /**
   * Stop-desk / pickup-point station code.
   * Required when deliveryType = "stop_desk".
   * NOEST: alphanumeric station code (e.g. "16A").
   * ZR Express: territory UUID of the pickup-point (detected by UUID format in adapter).
   * Both providers use this single field — adapter auto-detects the format.
   */
  stationCode: text("station_code"),
  /**
   * Delivery fee charged to the customer (from the store's shipping profile).
   * Set at order creation and NEVER changed after that.
   */
  deliveryFee: doublePrecision("delivery_fee").notNull().default(0),
  /**
   * The driver's cut for this delivery (from the driver's shipping profile for this wilaya).
   * Set when a driver is assigned.
   */
  driverFee: doublePrecision("driver_fee").notNull().default(0),
  /**
   * Cash-on-delivery amount the driver must collect from the customer.
   * Set to order.price + delivery_fee on creation. Added to driver.pendingCash when delivered.
   */
  codAmount: doublePrecision("cod_amount").notNull().default(0),

  /** Parcel weight in kg — sent to carrier API when set (optional). */
  weight: doublePrecision("weight"),
  /** Fragile parcel flag — sent to carrier API when set (optional). */
  isFragile: boolean("is_fragile"),

  pickupTime: text("pickup_time"),
  deliveryTime: text("delivery_time"),
  deliveryAttempts: integer("delivery_attempts").default(0),

  photos: text("photos"), // JSON array

  // ── Payment settlement tracking ───────────────────────────────────────────
  /** Set when the COD amount of this order has been remitted to the shop. */
  codPaymentId: text("cod_payment_id"),
  /** Set when the driver's delivery fee for this order has been paid out. */
  feePaymentId: text("fee_payment_id"),

  // ── Meta Pixel / CAPI attribution ────────────────────────────────────────
  /** _fbc cookie captured at placement — links the sale back to the ad click. */
  fbc: text("fbc"),
  /** _fbp cookie captured at placement — browser identity for EMQ. */
  fbp: text("fbp"),
  /** CF-Connecting-IP at placement — sent as client_ip_address in CAPI event. */
  ipAddress: text("ip_address"),
  /** User-Agent at placement — sent as client_user_agent in CAPI event. */
  userAgent: text("user_agent"),

  // ── Landing page attribution (appended by migration 0019 — keep last) ────
  /** Landing page the order was placed from (best-effort attribution — never blocks an order). */
  landingPageId: text("landing_page_id"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),

  // ── Checkout form capture (appended by migration 0031) ────────────────────
  //
  // These sit after createdAt/updatedAt deliberately. cod-server's mock db maps
  // a full-table select positionally by SCHEMA order (src/test-utils/mock-db.ts),
  // so a column inserted mid-table silently shifts every fixture after it.
  // Appending keeps every existing fixture valid and makes the rule simple for
  // the next column too: new columns go last.
  /**
   * The shopper's email as captured at order time, when the merchant enabled
   * the field on the Checkout Form page. A snapshot like customerName/phone —
   * the order keeps what was true when it was placed. Never sent to carriers.
   */
  customerEmail: text("customer_email"),
  /**
   * Answers to the merchant's custom checkout fields:
   * JSON `[{ id, label, type, value }]`, in policy order.
   *
   * The label is stored with the answer because the merchant may rename or
   * delete the field later, and an order must keep reading the way it read when
   * it was placed. The dashboard renders this snapshot and never re-resolves it
   * against the live policy. Carriers and pricing never read it.
   */
  customFieldsJson: text("custom_fields_json"),
  deliveryFeeToConfirm: boolean("delivery_fee_to_confirm").notNull().default(false),
  stockConfirmed: boolean("stock_confirmed").notNull().default(true),
  deliveryGridVersion: integer("delivery_grid_version"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  gclid: text("gclid"),
  ttclid: text("ttclid"),
  fbclid: text("fbclid"),
  adCookies: jsonb("ad_cookies").$type<{ ttp?: string; scid?: string; gaClientId?: string }>(),
  trackingConsent: boolean("tracking_consent"),
  deviceId: text("device_id"),
}, (t) => ({
  orderNumberPerStore: uniqueIndex("orders_store_order_number_unique").on(t.storeId, t.orderNumber),
  recentByPhone: index("orders_store_phone_created_idx").on(t.storeId, t.phone, t.createdAt),
  recentByDevice: index("orders_store_device_created_idx").on(t.storeId, t.deviceId, t.createdAt),
  recentByIp: index("orders_store_ip_created_idx").on(t.storeId, t.ipAddress, t.createdAt),
}));

export const OUTBOUND_OUTCOMES = ["accepted", "duplicate", "review", "rejected", "retry", "unknown", "error"] as const;
export type OutboundOutcome = (typeof OUTBOUND_OUTCOMES)[number];

export const outboundOrders = pgTable("outbound_orders", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  status: text("status", { enum: ["pending", "sent", "rejected"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  aventyOrderId: text("aventy_order_id"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { mode: "date", withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { mode: "date", withTimezone: true }),
  lastOutcome: text("last_outcome", { enum: OUTBOUND_OUTCOMES }),
  outcomeDetail: jsonb("outcome_detail").$type<{ reasons?: string[]; fields?: string[] }>(),
  alertedAt: timestamp("alerted_at", { mode: "date", withTimezone: true }),
  queuedAt: timestamp("queued_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  due: index("outbound_orders_due_idx").on(t.nextAttemptAt, t.id).where(sql`status = 'pending'`),
  channelLine: index("outbound_orders_channel_line_idx").on(t.storeId, t.createdAt, t.id).where(sql`status = 'pending'`),
  attempted: index("outbound_orders_attempted_idx").on(t.storeId, t.createdAt, t.id).where(sql`status = 'pending' and attempts > 0`),
  lastSent: index("outbound_orders_sent_at_idx").on(t.sentAt).where(sql`status = 'sent'`),
}));

export const BLOCKED_ORDER_REASONS = ["blocked_phone", "phone_window", "device_window", "ip_ceiling", "ip_flagged"] as const;
export type BlockedOrderReason = (typeof BLOCKED_ORDER_REASONS)[number];

export const blockedOrderAttempts = pgTable("blocked_order_attempts", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  reason: text("reason", { enum: BLOCKED_ORDER_REASONS }).notNull(),
  orderNumber: text("order_number").notNull(),
  phone: text("phone").notNull(),
  customerName: text("customer_name").notNull(),
  deviceId: text("device_id"),
  ipAddress: text("ip_address"),
  details: jsonb("details").$type<{ lines: Array<{ productName: string; quantity: number }>; total: number | null }>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  recent: index("blocked_order_attempts_store_created_idx").on(t.storeId, t.createdAt),
}));

export const blockedPhones = pgTable("blocked_phones", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  phonePerMerchant: uniqueIndex("blocked_phones_merchant_phone_unique").on(t.merchantId, t.phone),
}));

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  storeId: text("store_id")
    .references(() => stores.id, { onDelete: "cascade" })
    .default(sql`nullif(current_setting('app.store_id', true), '')`),
  payload: jsonb("payload").notNull(),
  dedupKey: text("dedup_key").unique(),
  status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  runAt: timestamp("run_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: true }),
  lastError: text("last_error"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
}, (t) => ({
  due: index("jobs_due_idx").on(t.runAt).where(sql`status in ('pending', 'running')`),
  byStore: index("jobs_store_kind_idx").on(t.storeId, t.kind, t.createdAt),
}));

export const orderAssignments = pgTable("order_assignments", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),

  assigneeType: text("assignee_type", { enum: ["driver", "company"] }).notNull(),
  assigneeId: text("assignee_id").notNull(),
  assigneeName: text("assignee_name").notNull(),

  assignedBy: text("assigned_by").notNull(),
  assignedAt: text("assigned_at").notNull(),
  unassignedAt: text("unassigned_at"),
  reason: text("reason"),

  acceptedAt: text("accepted_at"),
  pickupAt: text("pickup_at"),
  deliveredAt: text("delivered_at"),
  status: text("status", {
    enum: ["assigned", "accepted", "picked_up", "delivered", "returned", "cancelled"],
  })
    .notNull()
    .default("assigned"),
});

export const orderStatusHistory = pgTable("order_status_history", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: [
      "new",
      "confirmed",
      "unreachable",
      "preparing",
      "ready",
      "assigned",
      "dispatched",
      "out_for_delivery",
      "delivered",
      "returned",
      "cancelled",
    ],
  }).notNull(),
  timestamp: text("timestamp").notNull(),
  by: text("by"),
});

// ─── Product Catalog ─────────────────────────────────────────────────────────

export const productCategories = pgTable("product_categories", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  parentId: text("parent_id"), // self-reference at app level
  imageUrl: text("image_url"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: versionColumn(),
}, (t) => ({
  slugPerMerchant: uniqueIndex("product_categories_merchant_slug_unique").on(t.merchantId, t.slug),
}));

export const products = pgTable("products", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  descriptionFormat: text("description_format", { enum: ["text", "html"] })
    .notNull()
    .default("text"), // 'text' renders literally (legacy rows); 'html' is sanitised at write
  handle: text("handle").notNull(), // URL slug (was "slug")
  currency: text("currency").notNull().default("DZD"),
  price: integer("price").notNull(), // base price in DZD (whole number)
  compareAtPrice: integer("compare_at_price"),
  costPrice: integer("cost_price"),
  type: text("type", { enum: ["PHYSICAL", "DIGITAL"] }).notNull().default("PHYSICAL"),
  hasVariants: boolean("has_variants").notNull().default(false),
  variantOptions: text("variant_options"), // JSON: [{name: string, values: [{value: string, hexColor?: string}]}]
  sku: text("sku"), // only for simple products (hasVariants=false)
  inventory: integer("inventory").notNull().default(0), // only for simple products
  /**
   * Master inventory toggle. When false, the product is excluded from stock
   * tracking entirely:
   *   - Simple: products.inventory is ignored; orders never deduct it.
   *   - Variant parent: ALL of its variants are excluded — orders never deduct
   *     from any variant, and stock alerts/overview hide the whole product.
   * Variant rows do not have their own toggle; the parent flag governs them.
   */
  trackInventory: boolean("track_inventory").notNull().default(true),
  /** Alert when inventory drops to or below this number (0 = disabled). */
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  categoryId: text("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  tags: text("tags"), // JSON string[]
  visibility: boolean("visibility").notNull().default(true),
  status: text("status", { enum: ["DRAFT", "ACTIVE", "ARCHIVED"] }).notNull().default("ACTIVE"),
  deletedAt: text("deleted_at"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: versionColumn(),
}, (t) => ({
  handlePerMerchant: uniqueIndex("products_merchant_handle_unique").on(t.merchantId, t.handle),
  skuPerMerchant: uniqueIndex("products_merchant_sku_unique").on(t.merchantId, t.sku),
}));

export const channelProducts = pgTable("channel_products", {
  storeId: storeIdColumn(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  published: boolean("published").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  position: integer("position").notNull().default(0),
  shippingProfileId: text("shipping_profile_id").references(() => shippingProfiles.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.storeId, t.productId] }),
}));

export const channelDesigns = pgTable("channel_designs", {
  storeId: storeIdColumn().primaryKey(),
  draft: jsonb("draft"),
  draftBaseVersion: integer("draft_base_version"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const channelDesignVersions = pgTable("channel_design_versions", {
  storeId: storeIdColumn(),
  version: integer("version").notNull(),
  document: jsonb("document").notNull(),
  publishedAt: text("published_at").notNull(),
  publishedBy: text("published_by"),
}, (t) => ({
  pk: primaryKey({ columns: [t.storeId, t.version] }),
}));

export const productVariants = pgTable("product_variants", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variations: text("variations").notNull(), // JSON: {"Color": "Red", "Size": "M"}
  currency: text("currency").notNull().default("DZD"),
  price: integer("price").notNull(), // price in DZD
  compareAtPrice: integer("compare_at_price"),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  inventory: integer("inventory").notNull().default(0),
  /** Alert when variant inventory drops to or below this number (0 = disabled). */
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  weightKg: doublePrecision("weight_kg"),
  imageId: text("image_id"), // reference to productImages.id
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: versionColumn(),
}, (t) => ({
  skuPerMerchant: uniqueIndex("product_variants_merchant_sku_unique").on(t.merchantId, t.sku),
}));

export const productImages = pgTable("product_images", {
  merchantId: merchantIdColumn(),
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  src: text("src").notNull(), // original URL
  r2Key: text("r2_key"),
  srcSm: text("src_sm"),
  srcMd: text("src_md"),
  srcLg: text("src_lg"),
  altText: text("alt_text"),
  width: integer("width"),
  height: integer("height"),
  type: integer("type").notNull().default(1), // 1=image, 2=video
  position: integer("position").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: versionColumn(),
});

/** Status lifecycle value for orders — derived from the column enum. */
export type OrderStatus = (typeof orders.$inferSelect)["status"];

export const orderProducts = pgTable("order_products", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name").notNull(),
  variantId: text("variant_id").references(() => productVariants.id),
  variantLabel: text("variant_label"), // denormalized: "أحمر / XL"
  sku: text("sku"), // denormalized from products.sku / product_variants.sku at creation time
  quantity: integer("quantity").notNull(),
  pricePerUnit: doublePrecision("price_per_unit").notNull(),
  lineTotal: doublePrecision("line_total").notNull(),
  /**
   * Per-line fulfilment outcome — supports Algerian box-opening returns.
   *   fulfilled           — customer kept all units (returnedQuantity = 0)
   *   partially_returned  — customer kept some, returned some (0 < returnedQuantity < quantity)
   *   returned            — customer refused the whole line (returnedQuantity = quantity)
   */
  status: text("status", { enum: ["fulfilled", "partially_returned", "returned"] })
    .notNull()
    .default("fulfilled"),
  /** Units the customer refused at the door. 0 when status = fulfilled. */
  returnedQuantity: integer("returned_quantity").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// ─── Delivery Provider Integration ───────────────────────────────────────────

/**
 * Carrier stop-desk / pickup-point cache and admin control table.
 *
 * Populated by POST /delivery-companies/:id/sync-stop-desks (calls provider.getStopDesks()).
 * The `active` flag survives re-syncs for desks still listed at the carrier — only the
 * admin can toggle it. A desk removed at the carrier is hard-deleted on sync (its flag
 * goes with it); if it reappears later it comes back active by default. This allows
 * the admin to deactivate specific communes for their account.
 *
 * `code` maps to what is sent as stationCode in the carrier API:
 *   EcoTrack/Packers → code_postal string (e.g. "16001")
 *   NOEST            → station code string (e.g. "16A")
 *   Yalidine         → center_id as string (e.g. "42")
 *   ZR Express       → territory UUID
 */
export const companyStopDesks = pgTable("company_stop_desks", {
  storeId: storeIdColumn(),
  id:        text("id").primaryKey(),
  companyId: text("company_id")
               .notNull()
               .references(() => deliveryCompanies.id, { onDelete: "cascade" }),
  code:      text("code").notNull(),
  name:      text("name").notNull(),
  commune:   text("commune"),
  wilayaId:  integer("wilaya_id").references(() => wilayas.id),
  address:   text("address"),
  phones:    text("phones"),   // JSON: string[]
  /** Admin-controlled: false = hidden from dispatch dialog. Never reset by sync. */
  active:    boolean("active").notNull().default(true),
  syncedAt:  text("synced_at").notNull(),
}, (t) => ({
  companyCodeUnique: uniqueIndex("company_stop_desks_company_code_unique")
                       .on(t.companyId, t.code),
}));

/**
 * Tracks shipments created via third-party delivery company APIs.
 * One record per API-dispatched shipment, linked to the order.
 *
 * Intentionally carries NO status column — the order's lifecycle is owned by
 * orders.status (single source of truth). This table only stores the
 * carrier-side handle (tracking number, label, raw response) and the
 * validated flag for the provider's two-step create→validate flow.
 */
export const companyShipments = pgTable("company_shipments", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  companyId: text("company_id")
    .notNull()
    .references(() => deliveryCompanies.id),
  /** Tracking number returned by the company API (e.g. "ECS12345678"). */
  trackingNumber: text("tracking_number").notNull(),
  /** Whether the shipment has been validated via the company's validate endpoint. */
  validated: boolean("validated").notNull().default(false),
  /** URL to the printable shipping label PDF, if available. */
  labelUrl: text("label_url"),
  /** Raw JSON response from the create-shipment API call. */
  rawResponse: text("raw_response"), // JSON
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Audit log for every outbound API call to delivery company APIs.
 */
export const companyApiLogs = pgTable("company_api_logs", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => deliveryCompanies.id),
  /** The order this call was related to, if any. */
  orderId: text("order_id").references(() => orders.id),
  /** Short action name: "create_shipment", "validate", "track", "delete", "get_fees" */
  action: text("action").notNull(),
  method: text("method").notNull(), // "GET" | "POST" | "PATCH" | "DELETE"
  endpoint: text("endpoint").notNull(), // relative path, e.g. "/api/public/create/order"
  /** Serialised request payload (sensitive fields stripped). */
  requestBody: text("request_body"), // JSON
  httpStatus: integer("http_status"),
  /** Serialised response body (truncated if large). */
  responseBody: text("response_body"), // JSON
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  /** Round-trip time in milliseconds. */
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull(),
});

// ─── Store ────────────────────────────────────────────────────────────────────

/**
 * One store per deployment. Holds branding, theme, and SEO settings
 * editable from the dashboard.
 */
export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain"),
  logoUrl: text("logo_url"),

  // ── Theme ─────────────────────────────────────────────────────────────────
  /** Active theme slug: "theme01", "theme02", etc. */
  themeId: text("theme_id").notNull().default("theme01"),
  /** Primary CTA color (hex, e.g. "#7c3aed") */
  primaryColor: text("primary_color").notNull().default("#7c3aed"),
  /** Accent / highlight color */
  accentColor: text("accent_color").notNull().default("#f59e0b"),
  /** Background color */
  bgColor: text("bg_color").notNull().default("#f8f8f8"),
  /** CSS font-family string */
  fontFamily: text("font_family").notNull().default("Cairo, sans-serif"),
  /** Google Fonts import URL (optional override) */
  fontUrl: text("font_url"),

  // ── Locale ────────────────────────────────────────────────────────────────
  /**
   * Store UI language. Drives `<html lang>`/`dir` in the storefront layout and
   * selects which locale of a store page the shopper is served.
   *
   * `fr` is a type-only widening: the column is plain `text` with no CHECK
   * constraint (0000_complete.sql), and theme01 has always shipped an `fr`
   * content pack that nothing could reach.
   */
  lang: text("lang", { enum: ["ar", "en", "fr"] }).notNull().default("ar"),
  currency: text("currency").notNull().default("DZD"),
  currencySymbol: text("currency_symbol").notNull().default("دج"),

  // ── Content (all user-facing text — no hardcoding in theme) ──────────────
  /**
   * JSON blob of every text string shown in the storefront.
   * Schema: StoreFrontContent (see cod-astro/theme01/src/lib/content.ts)
   * Editable from the dashboard Store Settings page.
   */
  contentJson: text("content_json"),

  // ── SEO ───────────────────────────────────────────────────────────────────
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImage: text("og_image"),

  // ── Optional features ─────────────────────────────────────────────────────
  /** Top announcement bar text (null = hidden) */
  announcementBar: text("announcement_bar"),
  /** When false, reviews are hidden on the storefront and submission is disabled. */
  reviewsEnabled: boolean("reviews_enabled").notNull().default(true),
  /**
   * Shopping cart opt-in. False (the default) keeps the storefront exactly as
   * it is: the direct one-click order form, no cart. True adds "Add to cart"
   * alongside it — the direct form is never replaced.
   */
  cartEnabled: boolean("cart_enabled").notNull().default(false),

  // ── Delivery pricing ──────────────────────────────────────────────────────
  /**
   * Order subtotal (DZD) at or above which delivery is free.
   * NULL = feature off. Distinct from 0, which would make EVERY order free.
   * Applies to every order — cart or single product.
   */
  freeShippingThreshold: integer("free_shipping_threshold"),
  /**
   * Which rate a basket spanning several shipping profiles pays.
   *   "highest"         — the dearest applicable rate (default)
   *   "default_profile" — always the store default profile's rate
   * A single-product order resolves identically under both.
   */
  cartShippingMode: text("cart_shipping_mode", { enum: ["highest", "default_profile"] })
    .notNull()
    .default("highest"),

  status: text("status", { enum: CHANNEL_STATUSES }).notNull().default("draft"),
  /** Plaintext storefront API key — written on every provision so the merchant can view it in settings. */
  storeApiKey: text("store_api_key"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),

  // ── Checkout form policy (appended by migration 0031) ─────────────────────
  //
  // Placed last for the same reason as the orders columns above: the mock db
  // maps full-table selects positionally by schema order.
  /**
   * The Checkout Form Policy — which controllable fields the storefront order
   * form renders, how strictly each is enforced, and the merchant's own custom
   * fields. Shape: CheckoutFormPolicy (cod-shared/checkout-form).
   *
   * NULL means "the defaults", and the defaults are today's form exactly, so a
   * store that never opens the Checkout Form page is untouched by this feature.
   * Rollback for the whole feature is `UPDATE stores SET checkout_form_json = NULL`.
   *
   * Never exposed raw to the storefront: getStoreConfig replaces it with the
   * parsed `checkoutForm` projection.
   */
  checkoutFormJson: text("checkout_form_json"),

  // ── WhatsApp widget (appended by migration 0032) ──────────────────────────
  /**
   * The WhatsApp Widget configuration — the merchant's number, the identity
   * shown in the chat panel, the message texts, the appearance, and which
   * storefront surfaces the launcher appears on. Shape: WhatsAppWidgetConfig
   * (cod-shared/whatsapp-widget).
   *
   * NULL means "no widget", so a store that never opens the WhatsApp page
   * ships no widget markup at all. Rollback for the whole feature is
   * `UPDATE stores SET whatsapp_widget_json = NULL`.
   *
   * Never exposed raw to the storefront: getStoreConfig replaces it with the
   * resolved `whatsapp` projection, which is null whenever the widget cannot
   * render.
   *
   * Last for the same positional reason as the columns above.
   */
  whatsappWidgetJson: text("whatsapp_widget_json"),
  orderPrefix: text("order_prefix").notNull().default("CMD"),
  orderSeq: integer("order_seq").notNull().default(0),
  /** The merchant that owns this store. Last for the same positional reason. */
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  defaultShippingProfileId: text("default_shipping_profile_id").references(() => shippingProfiles.id, { onDelete: "set null" }),
  creationKey: text("creation_key"),
  channelType: text("channel_type", { enum: CHANNEL_TYPES }).notNull().default("store"),
  unavailableRule: text("unavailable_rule", { enum: UNAVAILABLE_RULES }).notNull().default("show_unavailable"),
  orderLimitMinutes: integer("order_limit_minutes").notNull().default(10),
}, (t) => ({
  merchantIdx: index("stores_merchant_idx").on(t.merchantId),
  creationKeyPerMerchant: uniqueIndex("stores_merchant_creation_key_unique").on(t.merchantId, t.creationKey),
}));

/**
 * API keys issued to Astro storefronts.
 * The raw key is never stored — only a SHA-256 hex digest.
 */
/**
 * Platform routing: which channel (store) a hostname serves — a free
 * subdomain or a merchant's own domain. Read before any store is known, so it
 * sits outside Row-Level Security; request code may read it, never write it.
 */
export const storeDomains = pgTable("store_domains", {
  hostname: text("hostname").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["subdomain", "custom"] }).notNull(),
  createdAt: text("created_at").notNull(),
  status: text("status", { enum: ["pending", "verified", "failed"] }).notNull().default("pending"),
  verifiedAt: text("verified_at"),
  checkedAt: text("checked_at"),
  lastError: text("last_error"),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => ({
  storeIdx: index("store_domains_store_idx").on(t.storeId),
  onePrimaryPerStore: uniqueIndex("store_domains_one_primary").on(t.storeId).where(sql`${t.isPrimary}`),
}));

export const storeApiKeys = pgTable("store_api_keys", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  /** SHA-256 hex digest of the raw key */
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull().default("default"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
});

// ─── Reviews ──────────────────────────────────────────────────────────────────

/**
 * Product reviews submitted by customers via the storefront.
 * Requires a valid order_id from the same store — identity comes from the order.
 * Moderated by the merchant: pending → approved | rejected.
 */
export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** Denormalised order number for display (e.g. "ORD-0042"). */
  orderNumber: text("order_number").notNull(),
  /** Denormalised customer name from the order at submission time. */
  customerName: text("customer_name").notNull(),
  /** Star rating 1–5. Enforced at application layer and DB CHECK. */
  rating: integer("rating").notNull(),
  title: text("title"),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  helpfulCount: integer("helpful_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  orderUnique: uniqueIndex("reviews_order_unique").on(t.orderId),
}));

// ─── Activity Logs ────────────────────────────────────────────────────────────

/**
 * Audit trail of all write actions performed by staff and admin users.
 * Only admins can query this table.
 */
export const activityLogs = pgTable("activity_logs", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  /** ID of the user who performed the action. */
  actorId: text("actor_id").notNull(),
  /** Denormalised name — preserved even if user is later deleted. */
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role", { enum: ["admin", "staff"] }).notNull(),
  /** Dot-notation action: "order.created", "user.role_changed", etc. */
  action: text("action").notNull(),
  /** Entity category: "order", "customer", "driver", "product", "user". */
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  /** Human-readable label at the time of action (order number, name, etc.). */
  entityLabel: text("entity_label"),
  /** Extra context as JSON (e.g. status transitions, amounts). */
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
});

// ─── Stock Movements ──────────────────────────────────────────────────────────

/**
 * Every inventory change — regardless of source — creates one row here.
 * This is the audit trail and the backbone of all stock reporting.
 *
 * Movement types:
 *   PURCHASE          — stock received from supplier (delta > 0)
 *   ADJUSTMENT_ADD    — manual correction / count adjustment upward (delta > 0)
 *   ADJUSTMENT_REMOVE — manual correction / damage / loss (delta < 0)
 *   ORDER_DEDUCTED    — stock reserved when an order is confirmed (delta < 0)
 *   ORDER_CANCELLED   — stock restored when an order is cancelled (delta > 0)
 *   ORDER_RETURNED    — stock restored when a delivered order is returned (delta > 0)
 *   OFFLINE_SALE      — direct sale not via the online order system (delta < 0)
 */
export const stockMovements = pgTable("stock_movements", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** NULL for simple products (hasVariants = false). */
  variantId: text("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "PURCHASE",
      "ADJUSTMENT_ADD",
      "ADJUSTMENT_REMOVE",
      "ORDER_DEDUCTED",
      "ORDER_CANCELLED",
      "ORDER_RETURNED",
      "OFFLINE_SALE",
    ],
  }).notNull(),
  /** Signed quantity change. Positive = stock in, negative = stock out. Never zero. */
  delta: integer("delta").notNull(),
  /** Inventory level immediately before this movement was applied. */
  qtyBefore: integer("qty_before").notNull(),
  /** Inventory level immediately after this movement was applied. */
  qtyAfter: integer("qty_after").notNull(),
  /** Human note explaining the reason (required for manual adjustments and offline sales). */
  reason: text("reason"),
  /** External reference — orderId for ORDER_* types, null otherwise. */
  reference: text("reference"),
  /** User ID of the team member who triggered this movement. */
  createdBy: text("created_by").notNull(),
  /** Denormalised name — preserved even if the user is later deleted. */
  createdByName: text("created_by_name").notNull(),
  createdAt: text("created_at").notNull(),
  merchantId: merchantIdColumn(),
});


// ─── Webhook Events ───────────────────────────────────────────────────────────

/**
 * Idempotency + audit log for every inbound webhook delivery from ZR Express or Yalidine.
 * UNIQUE(provider, event_id) prevents the same event from being processed twice.
 *
 * result values:
 *   ok       — order status was updated
 *   ignored  — event received, logged, no status change (non-status event / terminal order / same status)
 *   unmapped — state/status name not found in any mapping; admin must add it
 *   error    — exception during processing; still returned 200 to provider
 */
export const webhookEvents = pgTable("webhook_events", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  /** 'zr_express' | 'yalidine' */
  provider: text("provider").notNull(),
  /** svix-id header (ZR) or event_id field (Yalidine) — idempotency key */
  eventId: text("event_id").notNull(),
  companyId: text("company_id")
    .notNull()
    .references(() => deliveryCompanies.id),
  /** null if order not found by tracking/reference */
  orderId: text("order_id").references(() => orders.id),
  /** raw tracking number from the provider payload */
  tracking: text("tracking"),
  /** 'parcel.state.updated' / 'parcel_status_updated' / etc. */
  eventType: text("event_type").notNull(),
  /** full JSON body for debugging and future reprocessing */
  rawPayload: text("raw_payload").notNull(),
  /** 'ok' | 'ignored' | 'unmapped' | 'error' */
  result: text("result").notNull().default("pending"),
  /** the status we set on the order (when result='ok') */
  newStatus: text("new_status"),
  /** Yalidine reason field / ZR situation name */
  reason: text("reason"),
  errorMsg: text("error_msg"),
  processedAt: text("processed_at"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  providerEventUnique: uniqueIndex("webhook_events_provider_event_unique").on(t.provider, t.eventId),
}));

// ─── Offers ───────────────────────────────────────────────────────────────────

/**
 * Buy X Get Y promotional offers.
 * Automatically applied server-side on storefront order creation.
 * No coupon code required — Algerian COD market.
 *
 * Trigger: customer orders >= triggerQuantity of triggerProduct
 *          (optionally restricted to a specific triggerVariant; null = any variant)
 *
 * Reward:  server auto-adds rewardQuantity of rewardProduct at pricePerUnit = 0
 *          (optionally a specific rewardVariant; null behaviour depends on whether
 *           rewardProduct === triggerProduct — see store/queries.ts for resolution logic)
 *
 * Scheduling: null startsAt = active immediately; null endsAt = never expires.
 * Multiple active offers on same product: the one with the HIGHEST satisfied
 * triggerQuantity wins (store.ts selectApplicableOffer orders by triggerQuantity DESC).
 * createdAt ASC ordering applies only to the storefront display list.
 */
export const offers = pgTable("offers", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),

  /** Human-readable name shown in dashboard, e.g. "اشترِ 2 واحصل على 1 مجاناً" */
  name: text("name").notNull(),

  // ── Trigger ──────────────────────────────────────────────────────────────────
  /** Product the customer must buy to trigger this offer. */
  triggerProductId: text("trigger_product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /**
   * Optional: restrict trigger to a specific variant.
   * null = any variant (or simple product) of triggerProduct triggers the offer.
   */
  triggerVariantId: text("trigger_variant_id")
    .references(() => productVariants.id, { onDelete: "set null" }),
  /** Minimum quantity the customer must order to trigger the offer. */
  triggerQuantity: integer("trigger_quantity").notNull().default(2),

  // ── Reward ───────────────────────────────────────────────────────────────────
  /**
   * Product given as reward.
   * NULL when discountType = 'free_shipping' (no product reward — shipping is free instead).
   */
  rewardProductId: text("reward_product_id")
    .references(() => products.id, { onDelete: "cascade" }),
  /**
   * Optional: specific variant to give as reward.
   * null + rewardProductId === triggerProductId → same variantId the customer ordered.
   * null + rewardProductId !== triggerProductId → default/first active variant.
   * Set explicitly when rewardProduct has variants and differs from triggerProduct.
   */
  rewardVariantId: text("reward_variant_id")
    .references(() => productVariants.id, { onDelete: "set null" }),
  /** Quantity of reward items to add for free. 0 when discountType = 'free_shipping'. */
  rewardQuantity: integer("reward_quantity").notNull().default(1),

  // ── Discount ─────────────────────────────────────────────────────────────────
  /**
   * "free"          = reward items at pricePerUnit = 0 (Buy X Get Y free product).
   * "free_shipping" = delivery fee overridden to 0 (no reward product inserted).
   */
  discountType: text("discount_type", { enum: ["free", "free_shipping"] }).notNull().default("free"),

  // ── Schedule ─────────────────────────────────────────────────────────────────
  /** ISO 8601 datetime. null = active immediately. */
  startsAt: text("starts_at"),
  /** ISO 8601 datetime. null = never expires. */
  endsAt: text("ends_at"),

  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ─── Landing Pages ────────────────────────────────────────────────────────────

/**
 * A one-product marketing page: an ordered image stack with the COD order
 * form at the bottom. Merchants create several per product, run ads to each,
 * and compare which one converts. All marketing copy lives inside the images;
 * the engine charges the catalog price (no price override — see PR #90).
 */
export const landingPages = pgTable("landing_pages", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  /** Public URL identifier: [a-z0-9-]{3,60}. Auto-generated `lp-<8char>` default. */
  slug: text("slug").notNull(),
  /** Internal label, e.g. "Zinc v3 — carousel ad". Never rendered publicly. */
  name: text("name").notNull(),
  /** The single product this page sells. */
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  status: text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),

  // ── Spacing settings (the entire Studio right sidebar) ────────────────────
  /** Pixels between stacked images. 0 = flush stack. */
  imageGap: integer("image_gap").notNull().default(0),
  /** Pixels of page side padding. 0 = full-bleed. */
  sidePadding: integer("side_padding").notNull().default(0),
  /** Max content width in pixels. 0 = full width (mobile-first default). */
  contentMaxWidth: integer("content_max_width").notNull().default(0),

  // ── SEO ───────────────────────────────────────────────────────────────────
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),

  /** Render count of the published page (non-unique in v1). */
  views: integer("views").notNull().default(0),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  slugPerStore: uniqueIndex("landing_pages_store_slug_unique").on(t.storeId, t.slug),
}));

/**
 * One row of the landing page image stack. Mirrors product_images:
 * R2 object + alt text + position. `source` anticipates the AI-generation
 * future phase (upload | ai) without carrying any v1 behavior.
 * `width`/`height` (px, captured client-side at upload) let the storefront
 * reserve layout space before the bytes arrive — no form-jumping CLS.
 * Nullable: legacy rows and failed client measurements render without dims.
 */
export const landingPageImages = pgTable("landing_page_images", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  landingPageId: text("landing_page_id")
    .notNull()
    .references(() => landingPages.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  src: text("src").notNull(),
  altText: text("alt_text"),
  source: text("source", { enum: ["upload", "ai"] }).notNull().default("upload"),
  position: integer("position").notNull().default(1),
  width: integer("width"),
  height: integer("height"),
  createdAt: text("created_at").notNull(),
});

// ─── Dashboard branding ───────────────────────────────────────────────────────

/**
 * Single-row table (id = 'default') — written by the partner via push-brand,
 * read by the dashboard at request time through its D1 binding.
 */
export const dashboardBrand = pgTable("dashboard_brand", {
  id:           text("id").primaryKey().default("default"),
  brandName:    text("brand_name").notNull().default("Dashboard"),
  logoUrl:      text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#7c3aed"),
  metaTitle:    text("meta_title"),
  faviconUrl:   text("favicon_url"),
  updatedAt:    text("updated_at").notNull(),
});

// ─── Meta Pixel / CAPI ───────────────────────────────────────────────────────

/**
 * Per-store Meta Pixel + Conversions API configuration.
 * One row per store. No row = tracking disabled (safe default).
 * Kept separate from `stores` — analytics config is a distinct concern.
 */
export const storePixelConfig = pgTable("store_pixel_config", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .unique()
    .references(() => stores.id, { onDelete: "cascade" }),
  pixelId: text("pixel_id"),
  /** Merchant's label for the Meta ad account this pixel belongs to — reference only, never sent to Meta. */
  adAccountName: text("ad_account_name"),
  accessToken: text("access_token").notNull().default(""),
  /** Meta test event code — used during integration testing only. Set to null in production. */
  testEventCode: text("test_event_code"),
  /** Which CAPI event the merchant optimizes for — chosen explicitly in the dashboard, never defaulted by the UI. */
  conversionEvent: text("conversion_event", { enum: ["Lead", "Purchase", "Purchase_Confirmed", "Purchase_Delivered"] }).notNull().default("Purchase"),
  /** When true, CAPI events carry test_event_code to Meta's test stream instead of production measurement. */
  testMode: boolean("test_mode").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  /**
   * The master switch for per-landing-page tracking.
   *
   * While false, `landing_page_pixel_config` rows are ignored entirely and
   * every page reports to this pixel — which is both the default for every
   * store and the feature's rollback. It is honoured inside
   * `resolveTrackingConfig` and nowhere else, so the browser and the
   * Conversions API can never disagree about whether the feature is on.
   */
  perPageTrackingEnabled: boolean("per_page_tracking_enabled")
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  tiktokPixelId: text("tiktok_pixel_id"),
  tiktokAccessToken: text("tiktok_access_token"),
  tiktokTestEventCode: text("tiktok_test_event_code"),
  snapPixelId: text("snap_pixel_id"),
  snapAccessToken: text("snap_access_token"),
  ga4MeasurementId: text("ga4_measurement_id"),
  ga4ApiSecret: text("ga4_api_secret"),
  googleAdsId: text("google_ads_id"),
  googleAdsLabel: text("google_ads_label"),
  consentRequired: boolean("consent_required").notNull().default(false),
});

/**
 * A landing page's own Meta Pixel + Conversions API configuration, which
 * REPLACES the store's for that page's visitors and for the orders attributed
 * to it. No row = inherit the store, which is every landing page today.
 *
 * Deliberately a mirror of `store_pixel_config`: the identical shape is what
 * lets one resolver serve both sources, so precedence is the only thing this
 * feature adds rather than a second set of rules.
 *
 * Kept off `landing_pages` on purpose. That table is read with a full-table
 * `select()` on the public storefront path, where an `access_token` column
 * would be one careless spread away from shipping a credential to every
 * visitor's browser.
 */
export const landingPagePixelConfig = pgTable("landing_page_pixel_config", {
  storeId: storeIdColumn(),
  id: text("id").primaryKey(),
  landingPageId: text("landing_page_id")
    .notNull()
    .unique()
    .references(() => landingPages.id, { onDelete: "cascade" }),
  pixelId: text("pixel_id").notNull(),
  /** Merchant's label for the Meta ad account this pixel belongs to — reference only, never sent to Meta. */
  adAccountName: text("ad_account_name"),
  accessToken: text("access_token").notNull(),
  /** Meta test event code — used during integration testing only. */
  testEventCode: text("test_event_code"),
  /** This page's own conversion choice: a product with a 40% confirmation rate may deserve a different optimisation event from one at 80%. */
  conversionEvent: text("conversion_event", { enum: ["Lead", "Purchase", "Purchase_Confirmed", "Purchase_Delivered"] }).notNull().default("Purchase"),
  testMode: boolean("test_mode").notNull().default(false),
  /** Switched off = fall back to the store pixel, without losing what was configured. */
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-store WhatsApp OTP verification configuration (dzverify provider).
 * One row per store. No row = verification disabled (safe default).
 * Kept separate from `stores` — checkout verification is a distinct concern,
 * and the API key is merchant integration config (like carrier tokens), never
 * a worker secret.
 */
export const storeOtpConfig = pgTable("store_otp_config", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .unique()
    .references(() => stores.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  /** WhatsApp message language for OTP sends: en | fr | ar. */
  language: text("language", { enum: ["en", "fr", "ar"] }).notNull().default("ar"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-store Sendili transactional email configuration.
 * One row per store. No row = email sending disabled (safe default).
 * Kept separate from `stores` — outbound email is a distinct concern, and
 * the API key is merchant integration config (like carrier tokens and the
 * dzverify key), never a worker secret.
 */
export const storeEmailConfig = pgTable("store_email_config", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .unique()
    .references(() => stores.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  /** Verified sender address — its domain must be verified in the Sendili workspace. */
  fromEmail: text("from_email").notNull(),
  /** Optional sender display name (e.g. the store name). */
  fromName: text("from_name"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Per-store Cloudflare Turnstile configuration (checkout bot protection).
 * One row per store. No row = Turnstile disabled (safe default).
 * Kept separate from `stores` — checkout bot protection is a distinct concern,
 * and the secret key is merchant integration config (like the dzverify/Sendili
 * keys), never a worker secret. The site key is public by design (it is
 * rendered into storefront HTML); the secret key never leaves the server.
 */
export const storeTurnstileConfig = pgTable("store_turnstile_config", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .unique()
    .references(() => stores.id, { onDelete: "cascade" }),
  /** Public widget site key — safe to expose to the storefront. */
  siteKey: text("site_key").notNull(),
  /** Server-side siteverify secret — never returned to any client. */
  secretKey: text("secret_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Audit log for every CAPI event attempt sent by CodCapiWorkflow.
 * status: 'sent' | 'failed' | 'skipped'
 * metaEventId: fbtrace_id from Meta response (present on success only).
 */
/**
 * Merchant-owned content pages: Terms, Privacy, Refund/Return, Shipping, and
 * any custom page the merchant adds later.
 *
 * These exist because Meta Ads rejects a storefront with no policy pages, which
 * blocks an Algerian COD merchant from advertising at all. They are seeded from
 * the template pack in `cod-shared/legal/` at store provision, then owned
 * outright by the merchant — the storefront renders these rows and holds no
 * copy of its own.
 *
 * The page row is identity and publication state; the words live in
 * `storePageTranslations`, one row per locale.
 */
export const storePages = pgTable("store_pages", {
  id: text("id").primaryKey(),
  storeId: text("store_id")
    .notNull()
    .references(() => stores.id),
  /**
   * What this page *is*, independent of what it is called or where it lives.
   * The storefront resolves Terms by kind, never by slug, so a merchant may
   * rename `/pages/terms` to `/pages/conditions-generales` freely.
   */
  kind: text("kind", {
    enum: ["terms", "privacy", "refund", "shipping", "custom"],
  }).notNull(),
  /** Public URL segment under `/pages/`: [a-z0-9-]{3,60}, unique per store. */
  slug: text("slug").notNull(),
  /** Draft pages 404 on the storefront and are never indexed. */
  status: text("status", { enum: ["published", "draft"] })
    .notNull()
    .default("published"),
  showInFooter: boolean("show_in_footer").notNull().default(true),
  position: integer("position").notNull().default(0),
  /** Which template revision seeded this page; null for merchant-created pages. */
  templateVersion: integer("template_version"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  slugUnique: uniqueIndex("idx_store_pages_slug").on(t.storeId, t.slug),
  footerIdx: index("idx_store_pages_footer").on(t.storeId, t.status, t.position),
}));

/**
 * One locale of one page. Composite primary key `(pageId, locale)`.
 *
 * A store serves exactly one locale — `stores.lang` — but all three are seeded
 * so switching the store language never reveals a blank policy page.
 */
export const storePageTranslations = pgTable("store_page_translations", {
  storeId: storeIdColumn(),
  pageId: text("page_id")
    .notNull()
    .references(() => storePages.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: ["ar", "en", "fr"] }).notNull(),
  title: text("title").notNull(),
  /**
   * Sanitised at the write chokepoint (`cod-shared/queries/store-pages.ts`).
   * Rendered with `set:html` and never re-parsed downstream — the same
   * contract as a product's rich-text description.
   */
  bodyHtml: text("body_html").notNull(),
  /** Derived from bodyHtml via toPlainText(): meta-description fallback. */
  bodyPlain: text("body_plain").notNull(),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  /**
   * 'template' = still the untouched seed, 'merchant' = edited at least once.
   * Flipped by the write chokepoint, so the dashboard can tell a merchant
   * which pages still need five minutes of their attention without parsing
   * any HTML.
   */
  source: text("source", { enum: ["template", "merchant"] })
    .notNull()
    .default("template"),
  updatedAt: text("updated_at").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.pageId, t.locale] }),
}));

/**
 * The merchant facts a legal document cannot be written without.
 *
 * Substituted into the templates at seed time; a clause whose fact is missing
 * is omitted rather than rendered with a placeholder, so a seeded page is
 * always publishable as-is. The public subset (contact + windows) is exposed
 * through `/store/config` because Meta requires visible contact details on the
 * storefront as well as the policy pages themselves. Legal identity (RC, NIF)
 * appears only inside the documents.
 */
export const storeLegalProfile = pgTable("store_legal_profile", {
  storeId: text("store_id")
    .primaryKey()
    .references(() => stores.id, { onDelete: "cascade" }),
  legalName: text("legal_name"),
  /** Registre de Commerce number. */
  rcNumber: text("rc_number"),
  /** Numéro d'Identification Fiscale. */
  nif: text("nif"),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  /** 0 = no post-delivery return window offered; the clause is then omitted. */
  returnWindowDays: integer("return_window_days").notNull().default(0),
  deliveryMinDays: integer("delivery_min_days").notNull().default(2),
  deliveryMaxDays: integer("delivery_max_days").notNull().default(7),
  updatedAt: text("updated_at").notNull(),
});

export const capiEventLog = pgTable(
  "capi_event_log",
  {
  storeId: storeIdColumn(),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    eventName: text("event_name").notNull(),
    stage: text("stage").notNull().default("delivered"),
    status: text("status").notNull(),
    /**
     * Which Meta pixel this event was sent to — the first question asked when
     * a merchant running several pixels says an event is missing. Nullable:
     * rows written before migration 0029 genuinely do not know.
     */
    pixelId: text("pixel_id"),
    metaEventId: text("meta_event_id"),
    error: text("error"),
    sentAt: text("sent_at").notNull(),
  },
  (t) => ({
    orderIdx: index("idx_capi_event_log_order").on(t.orderId),
    claimUnique: uniqueIndex("idx_capi_event_log_claim").on(t.orderId, t.stage, t.eventName),
  })
);

// ─── better-auth tables ──────────────────────────────────────────────────────
// Declared so the dashboard's auth code can reference them via Drizzle. The D1
// schema itself is created by cod-server migrations (0000_complete.sql).

export const sessions = pgTable("sessions", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:     text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { mode: "date", precision: 3 }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
}, (t) => ({
  userIdIdx: index("sessions_user_id_idx").on(t.userId),
}));

export const accounts = pgTable("accounts", {
  id:                    text("id").primaryKey(),
  userId:                text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId:             text("account_id").notNull(),
  providerId:            text("provider_id").notNull(),
  issuer:                text("issuer"),
  accessToken:           text("access_token"),
  refreshToken:          text("refresh_token"),
  idToken:               text("id_token"),
  accessTokenExpiresAt:  timestamp("access_token_expires_at", { mode: "date", precision: 3 }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date", precision: 3 }),
  scope:                 text("scope"),
  password:              text("password"),
  createdAt:             timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt:             timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
}, (t) => ({
  userIdIdx: index("accounts_user_id_idx").on(t.userId),
}));

export const verifications = pgTable("verifications", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at", { mode: "date", precision: 3 }).notNull(),
  createdAt:  timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt:  timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
}, (t) => ({
  identifierIdx: index("verifications_identifier_idx").on(t.identifier),
}));

// ─── better-auth jwt() plugin ─────────────────────────────────────────────────
// RSA keypair storage for signing OAuth access tokens. The public half is
// exposed via /api/auth/jwks so cod-server can verify tokens offline.
// Added by the MCP rollout (MCP-5).
export const jwkss = pgTable("jwkss", {
  id:         text("id").primaryKey(),
  publicKey:  text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt:  timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  expiresAt:  timestamp("expires_at", { mode: "date", precision: 3 }),
  alg:        text("alg"),
  crv:        text("crv"),
});

// ─── @better-auth/oauth-provider (LEGACY — no longer written) ────────────────
// These tables backed the decommissioned Better Auth OAuth 2.1 Authorization
// Server plugin that used to issue MCP tokens from the dashboards. MCP OAuth
// moved to `@cloudflare/workers-oauth-provider` on cod-server (clients, grants,
// tokens, and props now live in the OAUTH_KV namespace, not D1). The tables are
// kept for historical data; nothing writes to them anymore. Do not drop without
// confirming no deployment still references them.
//
// Array columns (`string[]` in Better Auth's model) are stored as JSON text.
// Better Auth's Drizzle adapter serialises/deserialises automatically.
//
// `plural` mode is ON globally so Better Auth maps `oauthClient` → `oauthClients`
// in queries — table names below must match.

export const oauthClients = pgTable("oauthClients", {
  id:                      text("id").primaryKey(),
  clientId:                text("client_id").notNull().unique(),
  clientSecret:            text("client_secret"),
  disabled:                boolean("disabled").default(false),
  skipConsent:             boolean("skip_consent"),
  enableEndSession:        boolean("enable_end_session"),
  subjectType:             text("subject_type"),
  scopes:                  text("scopes"),                   // JSON string[]
  userId:                  text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name:                    text("name"),
  uri:                     text("uri"),
  icon:                    text("icon"),
  contacts:                text("contacts"),                 // JSON string[]
  tos:                     text("tos"),
  policy:                  text("policy"),
  softwareId:              text("software_id"),
  softwareVersion:         text("software_version"),
  softwareStatement:       text("software_statement"),
  redirectUris:            text("redirect_uris").notNull(),  // JSON string[]
  postLogoutRedirectUris:  text("post_logout_redirect_uris"),// JSON string[]
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  grantTypes:              text("grant_types"),              // JSON string[]
  responseTypes:           text("response_types"),           // JSON string[]
  type:                    text("type"),
  public:                  boolean("public"),
  clientIdIssuedAt:        timestamp("client_id_issued_at", { mode: "date", precision: 3 }),
  clientSecretExpiresAt:   timestamp("client_secret_expires_at", { mode: "date", precision: 3 }),
  requirePkce:             boolean("require_pkce"),
  referenceId:             text("reference_id"),
  metadata:                text("metadata"),                 // JSON
  createdAt:               timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt:               timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
}, (t) => ({
  userIdIdx: index("oauthClients_user_id_idx").on(t.userId),
}));

export const oauthRefreshTokens = pgTable("oauthRefreshTokens", {
  id:          text("id").primaryKey(),
  token:       text("token").notNull(),
  clientId:    text("client_id").notNull().references(() => oauthClients.clientId),
  sessionId:   text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId:      text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  expiresAt:   timestamp("expires_at", { mode: "date", precision: 3 }).notNull(),
  createdAt:   timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  revoked:     timestamp("revoked", { mode: "date", precision: 3 }),
  authTime:    timestamp("auth_time", { mode: "date", precision: 3 }),
  scopes:      text("scopes").notNull(),                     // JSON string[]
}, (t) => ({
  tokenIdx:    index("oauthRefreshTokens_token_idx").on(t.token),
  userIdIdx:   index("oauthRefreshTokens_user_id_idx").on(t.userId),
  clientIdIdx: index("oauthRefreshTokens_client_id_idx").on(t.clientId),
}));

export const oauthAccessTokens = pgTable("oauthAccessTokens", {
  id:          text("id").primaryKey(),
  token:       text("token").unique(),
  clientId:    text("client_id").notNull().references(() => oauthClients.clientId),
  sessionId:   text("session_id").references(() => sessions.id, { onDelete: "set null" }),
  userId:      text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  refreshId:   text("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "set null" }),
  expiresAt:   timestamp("expires_at", { mode: "date", precision: 3 }).notNull(),
  createdAt:   timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  scopes:      text("scopes").notNull(),                     // JSON string[]
}, (t) => ({
  userIdIdx:   index("oauthAccessTokens_user_id_idx").on(t.userId),
  clientIdIdx: index("oauthAccessTokens_client_id_idx").on(t.clientId),
}));

export const oauthConsents = pgTable("oauthConsents", {
  id:          text("id").primaryKey(),
  clientId:    text("client_id").notNull().references(() => oauthClients.clientId),
  userId:      text("user_id").references(() => users.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  scopes:      text("scopes").notNull(),                     // JSON string[]
  createdAt:   timestamp("created_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
  updatedAt:   timestamp("updated_at", { mode: "date", precision: 3 }).default(authNow).notNull(),
}, (t) => ({
  userClientIdx: index("oauthConsents_user_client_idx").on(t.userId, t.clientId),
}));

// ─── Abandoned Orders ────────────────────────────────────────────────────────
// Recorded when a visitor fills name + phone in the storefront but never places an order.
// One record per browser session (sessionId UNIQUE). Status lifecycle:
//   pending  → created, < 30 min old (may still convert)
//   abandoned → 30+ min old with no order (Cron Trigger flips this)
//   converted → visitor placed an order (markConverted called synchronously)
//   contacted → merchant manually marked outreach done
export const abandonedOrders = pgTable("abandoned_orders", {
  storeId: storeIdColumn(),
  id:                    text("id").primaryKey(),
  sessionId:             text("session_id").notNull().unique(),

  customerName:          text("customer_name").notNull(),
  phone:                 text("phone").notNull(),

  wilayaId:              integer("wilaya_id").references(() => wilayas.id),
  communeId:             text("commune_id").references(() => communes.id),
  wilayaName:            text("wilaya_name"),
  communeName:           text("commune_name"),

  /**
   * The first line of the basket, or the only product of a single-product
   * checkout. Always populated, so every existing reader — the dashboard
   * column, the search, the analytics query — works for both shapes.
   */
  productId:             text("product_id"),
  productName:           text("product_name"),
  variantId:             text("variant_id"),
  variantLabel:          text("variant_label"),
  /** Cart value at abandonment: the basket subtotal, or one unit's price. */
  price:                 doublePrecision("price"),

  /** The whole basket. NULL for a single-product checkout. See migration 0028. */
  itemsJson:             text("items_json"),
  /** Distinct lines in the basket, so the list can say "and 4 more" cheaply. */
  itemCount:             integer("item_count"),

  deliveryType: text("delivery_type", { enum: ["home", "stop_desk"] }),

  fbc:                   text("fbc"),
  fbp:                   text("fbp"),
  ipAddress:             text("ip_address"),
  userAgent:             text("user_agent"),

  status: text("status", {
    enum: ["pending", "abandoned", "contacted", "converted"],
  }).notNull().default("pending"),

  convertedOrderId:      text("converted_order_id"),
  convertedOrderNumber:  text("converted_order_number"),

  recoveryAttempts:      integer("recovery_attempts").notNull().default(0),
  lastRecoveryAt:        text("last_recovery_at"),

  createdAt:             text("created_at").notNull(),
  updatedAt:             text("updated_at").notNull(),
}, (t) => ({
  statusIdx:    index("abandoned_orders_status_idx").on(t.status),
  phoneIdx:     index("abandoned_orders_phone_idx").on(t.phone),
  createdAtIdx: index("abandoned_orders_created_at_idx").on(t.createdAt),
}));
