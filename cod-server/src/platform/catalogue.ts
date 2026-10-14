import type pg from "pg";

export async function productUsage(
  platform: pg.Pool,
  productId: string,
  storeId: string | undefined,
): Promise<{ hasOrders: boolean; otherStores: number }> {
  const { rows } = await platform.query<{ has_orders: boolean; other_stores: number }>(
    `select exists (select 1 from order_products where product_id = $1) as has_orders,
            (select count(*)::int from channel_products where product_id = $1 and store_id <> coalesce($2, '')) as other_stores`,
    [productId, storeId ?? null],
  );
  return { hasOrders: rows[0].has_orders, otherStores: rows[0].other_stores };
}

export async function shippingProfileUsage(
  platform: pg.Pool,
  profileId: string,
): Promise<{ products: number; stores: number }> {
  const { rows } = await platform.query<{ products: number; stores: number }>(
    `select (select count(*)::int from channel_products where shipping_profile_id = $1) as products,
            (select count(*)::int from stores where default_shipping_profile_id = $1) as stores`,
    [profileId],
  );
  return rows[0];
}

export async function profileProductCounts(platform: pg.Pool, merchantId: string): Promise<Map<string, number>> {
  const { rows } = await platform.query<{ profile_id: string; products: number }>(
    `select cp.shipping_profile_id as profile_id, count(*)::int as products
       from channel_products cp join stores s on s.id = cp.store_id
      where s.merchant_id = $1 and cp.shipping_profile_id is not null
      group by cp.shipping_profile_id`,
    [merchantId],
  );
  return new Map(rows.map((r) => [r.profile_id, r.products]));
}
