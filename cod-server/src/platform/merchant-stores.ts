import { randomUUID } from "node:crypto";
import type pg from "pg";
import { getDb } from "../../../cod-shared/db/client";
import { seedStorePages } from "../../../cod-shared/queries/store-pages";
import type { PlanPolicy } from "./plan-policy";
import { orderPrefixFor } from "../../../cod-shared/queries/order-numbers";
import { defaultTemplateFor, isTemplateFor, presetBrand } from "../../../cod-shared/channels/templates";
import { manifestFor } from "../../../cod-shared/channels/manifests";
import { claimCustomDomain, normaliseDomain } from "./channel-domains";
import type { ChannelType, UnavailableRule } from "../../../cod-shared/channels/types";
import {
  DEFAULT_CHECKOUT_FORM_POLICY,
  isDefaultCheckoutFormPolicy,
  serializeCheckoutFormPolicy,
} from "../../../cod-shared/checkout-form/policy";
import { canTransition, type ChannelStatus } from "../../../cod-shared/channels/lifecycle";
import { ACTIONS } from "@/lib/activity";

export interface MerchantStore {
  id: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  logoUrl: string | null;
  hostname: string | null;
  hasOrders: boolean;
  createdAt: string;
}

export interface Actor {
  id: string;
  name: string | null;
  role: "admin" | "staff";
}

const RESERVED_SUBDOMAINS = new Set(["www", "api", "app", "admin", "dashboard", "mail", "static", "cdn", "assets"]);
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normaliseSubdomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return SUBDOMAIN.test(value) && !RESERVED_SUBDOMAINS.has(value) ? value : null;
}

const STORE_COLUMNS = `s.id, s.name, s.channel_type as type, s.status, s.logo_url as "logoUrl",
            (select d.hostname from store_domains d where d.store_id = s.id
              order by (d.kind = 'subdomain') desc, d.created_at limit 1) as hostname,
            exists (select 1 from orders o where o.store_id = s.id) as "hasOrders",
            s.created_at as "createdAt"`;

export async function listMerchantStores(platform: pg.Pool, merchantId: string): Promise<MerchantStore[]> {
  const { rows } = await platform.query<MerchantStore>(
    `select ${STORE_COLUMNS}
       from stores s
      where s.merchant_id = $1
      order by s.created_at, s.id`,
    [merchantId],
  );
  return rows;
}

export async function firstStoreId(platform: pg.Pool, merchantId: string): Promise<string | null> {
  const { rows } = await platform.query<{ id: string }>(
    "select id from stores where merchant_id = $1 order by created_at, id limit 1",
    [merchantId],
  );
  return rows[0]?.id ?? null;
}

export async function merchantOwnsStore(platform: pg.Pool, merchantId: string, storeId: string): Promise<boolean> {
  const { rowCount } = await platform.query("select 1 from stores where id = $1 and merchant_id = $2", [storeId, merchantId]);
  return rowCount === 1;
}

export type CreateStoreResult =
  | { ok: true; store: MerchantStore; created: boolean }
  | { ok: false; reason: "invalid_subdomain" }
  | { ok: false; reason: "subdomain_taken" }
  | { ok: false; reason: "plan_limit"; limit: number; used: number }
  | { ok: false; reason: "unknown_products"; productIds: string[] }
  | { ok: false; reason: "main_product_required" }
  | { ok: false; reason: "unknown_shipping_profile" }
  | { ok: false; reason: "unknown_template" }
  | { ok: false; reason: "invalid_domain" }
  | { ok: false; reason: "domain_taken" };

export interface CreateStoreInput {
  merchantId: string;
  type?: ChannelType;
  unavailableRule?: UnavailableRule;
  name: string;
  subdomain: string;
  baseDomain: string;
  creationKey?: string;
  productIds?: string[];
  deliveryModes?: { home: boolean; stopDesk: boolean };
  defaultShippingProfileId?: string | null;
  templateId?: string;
  customDomain?: string;
}

async function storeById(client: pg.PoolClient, id: string): Promise<MerchantStore> {
  const { rows } = await client.query<MerchantStore>(`select ${STORE_COLUMNS} from stores s where s.id = $1`, [id]);
  return rows[0];
}

export async function createMerchantStore(
  platform: pg.Pool,
  input: CreateStoreInput,
  policy: PlanPolicy,
): Promise<CreateStoreResult> {
  const subdomain = normaliseSubdomain(input.subdomain);
  if (!subdomain) return { ok: false, reason: "invalid_subdomain" };
  const hostname = `${subdomain}.${input.baseDomain}`;
  const type = input.type ?? "store";
  const templateId = input.templateId ?? defaultTemplateFor(type);
  const brand = isTemplateFor(type, templateId) ? presetBrand(templateId, manifestFor(templateId, type)) : null;
  if (!brand) return { ok: false, reason: "unknown_template" };
  const productIds = [...new Set(input.productIds ?? [])];
  if (type === "landing" && productIds.length !== 1) return { ok: false, reason: "main_product_required" };
  const customDomain = input.customDomain?.trim() ? normaliseDomain(input.customDomain, input.baseDomain) : null;
  if (input.customDomain?.trim() && !customDomain) return { ok: false, reason: "invalid_domain" };

  const client = await platform.connect();
  const refuse = async <T extends CreateStoreResult>(result: T): Promise<T> => {
    await client.query("rollback");
    return result;
  };
  try {
    await client.query("begin");
    await client.query("select 1 from merchants where id = $1 for no key update", [input.merchantId]);

    if (input.creationKey) {
      const existing = await client.query<{ id: string }>(
        "select id from stores where merchant_id = $1 and creation_key = $2",
        [input.merchantId, input.creationKey],
      );
      if (existing.rows[0]) {
        const store = await storeById(client, existing.rows[0].id);
        await client.query("commit");
        return { ok: true, store, created: false };
      }
    }

    const decision = await policy.canCreateStore(client, input.merchantId);
    if (!decision.allowed) return refuse({ ok: false, reason: "plan_limit", limit: decision.limit, used: decision.used });

    const taken = await client.query("select 1 from store_domains where hostname = $1", [hostname]);
    if (taken.rowCount) return refuse({ ok: false, reason: "subdomain_taken" });

    if (productIds.length > 0) {
      const { rows } = await client.query<{ id: string }>(
        "select id from products where merchant_id = $1 and id = any($2) and deleted_at is null",
        [input.merchantId, productIds],
      );
      const known = new Set(rows.map((r) => r.id));
      const unknown = productIds.filter((id) => !known.has(id));
      if (unknown.length > 0) return refuse({ ok: false, reason: "unknown_products", productIds: unknown });
    }

    if (input.defaultShippingProfileId) {
      const { rowCount } = await client.query("select 1 from shipping_profiles where id = $1 and merchant_id = $2", [
        input.defaultShippingProfileId,
        input.merchantId,
      ]);
      if (!rowCount) return refuse({ ok: false, reason: "unknown_shipping_profile" });
    }

    const checkoutForm = input.deliveryModes
      ? { ...DEFAULT_CHECKOUT_FORM_POLICY, deliveryOptions: input.deliveryModes }
      : DEFAULT_CHECKOUT_FORM_POLICY;
    const prefixes = await client.query<{ order_prefix: string }>(
      "select order_prefix from stores where merchant_id = $1",
      [input.merchantId],
    );
    const id = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      `insert into stores (id, name, merchant_id, order_prefix, theme_id, checkout_form_json, default_shipping_profile_id, creation_key,
                           channel_type, unavailable_rule, domain, primary_color, accent_color, bg_color, font_family, font_url,
                           cart_enabled, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $10, $11, $12, $13, $14, $15, $16, $17, $18, $9, $9)`,
      [
        id,
        input.name.trim(),
        input.merchantId,
        orderPrefixFor(subdomain, prefixes.rows.map((r) => r.order_prefix)),
        templateId,
        isDefaultCheckoutFormPolicy(checkoutForm) ? null : serializeCheckoutFormPolicy(checkoutForm),
        input.defaultShippingProfileId ?? null,
        input.creationKey ?? null,
        now,
        type,
        input.unavailableRule ?? "show_unavailable",
        hostname,
        brand.primaryColor,
        brand.accentColor,
        brand.bgColor,
        brand.fontFamily,
        brand.fontUrl,
        type === "store",
      ],
    );
    await client.query(
      "insert into store_domains (hostname, store_id, kind, created_at, status, verified_at, is_primary) values ($1, $2, 'subdomain', $3, 'verified', $3, true)",
      [hostname, id, now],
    );
    if (customDomain) {
      const claimed = await claimCustomDomain(client, id, customDomain, new Date(now)).catch((err: { code?: string }) => {
        if (err.code === "23505") return { ok: false as const, reason: "taken" as const };
        throw err;
      });
      if (!claimed.ok) return refuse({ ok: false, reason: "domain_taken" });
    }
    if (productIds.length > 0) {
      await client.query(
        `insert into channel_products (store_id, product_id, position, created_at, updated_at)
         select $1, product_id, ordinality - 1, $3, $3 from unnest($2::text[]) with ordinality as t(product_id, ordinality)`,
        [id, productIds, now],
      );
    }
    await client.query("select set_config('app.store_id', $1, true)", [id]);
    await seedStorePages(getDb(client, { inTransaction: true }), id);
    const store = await storeById(client, id);
    await client.query("commit");
    return { ok: true, store, created: true };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    const { code, constraint } = err as { code?: string; constraint?: string };
    if (code === "23505" && constraint === "store_domains_pkey") return { ok: false, reason: "subdomain_taken" };
    throw err;
  } finally {
    client.release();
  }
}

export type ChangeStatusResult =
  | { ok: true; store: MerchantStore }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_transition"; from: ChannelStatus };

export async function changeStoreStatus(
  platform: pg.Pool,
  input: { merchantId: string; storeId: string; to: ChannelStatus; actor: Actor },
): Promise<ChangeStatusResult> {
  const client = await platform.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ name: string; status: ChannelStatus }>(
      "select name, status from stores where id = $1 and merchant_id = $2 for no key update",
      [input.storeId, input.merchantId],
    );
    const store = rows[0];
    if (!store) {
      await client.query("rollback");
      return { ok: false, reason: "not_found" };
    }
    if (!canTransition(store.status, input.to)) {
      await client.query("rollback");
      return { ok: false, reason: "invalid_transition", from: store.status };
    }

    const now = new Date().toISOString();
    await client.query("update stores set status = $2, updated_at = $3 where id = $1", [input.storeId, input.to, now]);
    await client.query(
      `insert into activity_logs (store_id, id, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, metadata, created_at)
       values ($1, $2, $3, $4, $5, $6, 'store', $1, $7, $8, $9)`,
      [
        input.storeId,
        randomUUID(),
        input.actor.id,
        input.actor.name ?? "Unknown",
        input.actor.role,
        ACTIONS.STORE_STATUS_CHANGED,
        store.name,
        JSON.stringify({ from: store.status, to: input.to }),
        now,
      ],
    );
    const updated = await client.query<MerchantStore>(`select ${STORE_COLUMNS} from stores s where s.id = $1`, [input.storeId]);
    await client.query("commit");
    return { ok: true, store: updated.rows[0] };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface StatusChange {
  id: string;
  actorName: string;
  from: ChannelStatus;
  to: ChannelStatus;
  createdAt: string;
}

export async function storeStatusHistory(
  platform: pg.Pool,
  merchantId: string,
  storeId: string,
): Promise<StatusChange[] | null> {
  if (!(await merchantOwnsStore(platform, merchantId, storeId))) return null;
  const { rows } = await platform.query<{ id: string; actor_name: string; metadata: string; created_at: string }>(
    `select id, actor_name, metadata, created_at from activity_logs
      where store_id = $1 and action = $2
      order by created_at desc, id desc`,
    [storeId, ACTIONS.STORE_STATUS_CHANGED],
  );
  return rows.map((row) => {
    const { from, to } = JSON.parse(row.metadata) as { from: ChannelStatus; to: ChannelStatus };
    return { id: row.id, actorName: row.actor_name, from, to, createdAt: row.created_at };
  });
}

export type DeleteStoreResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_archived" | "has_orders" | "last_store" | "name_mismatch" };

export async function deleteMerchantStore(
  platform: pg.Pool,
  input: { merchantId: string; storeId: string; confirmName: string },
): Promise<DeleteStoreResult> {
  const client = await platform.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from merchants where id = $1 for no key update", [input.merchantId]);
    const { rows } = await client.query<{ name: string; status: ChannelStatus; has_orders: boolean; siblings: number }>(
      `select s.name, s.status,
              exists (select 1 from orders o where o.store_id = s.id) as has_orders,
              (select count(*)::int from stores x where x.merchant_id = s.merchant_id and x.id <> s.id) as siblings
         from stores s where s.id = $1 and s.merchant_id = $2
          for update of s`,
      [input.storeId, input.merchantId],
    );
    const store = rows[0];
    const refusal: DeleteStoreResult | null = !store
      ? { ok: false, reason: "not_found" }
      : store.status !== "archived"
        ? { ok: false, reason: "not_archived" }
        : store.has_orders
          ? { ok: false, reason: "has_orders" }
          : store.siblings === 0
            ? { ok: false, reason: "last_store" }
            : input.confirmName.trim() !== store.name
              ? { ok: false, reason: "name_mismatch" }
              : null;
    if (refusal) {
      await client.query("rollback");
      return refusal;
    }
    await client.query("delete from store_pages where store_id = $1", [input.storeId]);
    await client.query("delete from stores where id = $1", [input.storeId]);
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
