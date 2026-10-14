/**
 * Re-exported from cod-shared/queries/orders.
 */
import type { AppDb } from "../../../../cod-shared/db/client";
import type { OrderStatus } from "../../../../cod-shared/db/schema";
import * as shared from "../../../../cod-shared/queries/orders";
import { enqueueConversionsForStatus } from "@/tracking/conversions";

export * from "../../../../cod-shared/queries/orders";

export async function updateOrderStatus(
  db: AppDb,
  orderId: string,
  newStatus: OrderStatus,
  userId?: string,
  userName?: string,
) {
  await shared.updateOrderStatus(db, orderId, newStatus, userId, userName);
  await enqueueConversionsForStatus(db, orderId, newStatus);
}

export async function updateOrderStatusWebhook(
  db: AppDb,
  orderId: string,
  newStatus: OrderStatus,
  source: string,
): Promise<{ updated: boolean }> {
  const result = await shared.updateOrderStatusWebhook(db, orderId, newStatus, source);
  if (result.updated) await enqueueConversionsForStatus(db, orderId, newStatus);
  return result;
}
