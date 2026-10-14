/**
 * Delivery fee resolution for dashboard orders: the shared resolver
 * (cod-shared/queries/shipping-resolution.ts) prices the order, and a
 * destination it cannot price is refused here.
 */

import { eq, and } from "drizzle-orm";
import type { AppDb } from "@/db";
import { offers } from "@/db/schema";
import { BusinessLogicError } from "@/lib/errors/classes";
import { ERROR_CODES } from "../../../../cod-shared/errors/codes";
import { first } from "../../../../cod-shared/db/client";
import { resolveDeliveryFee as resolveSharedFee } from "../../../../cod-shared/queries/shipping-resolution";

type DB = AppDb;

export interface ResolveFeeInput {
  wilayaId: number;
  communeId: string | null;
  deliveryType: "home" | "stop_desk";
  productIds: string[];
}

export interface ResolveFeeResult {
  deliveryFee: number;
}

export async function resolveDeliveryFee(db: DB, input: ResolveFeeInput): Promise<ResolveFeeResult> {
  const fee = await resolveSharedFee(db, input);
  if (fee === null) {
    throw new BusinessLogicError(
      input.deliveryType === "home"
        ? "Home delivery is not available to this destination"
        : "Stop-desk pickup is not available to this destination",
      ERROR_CODES.DELIVERY_NOT_AVAILABLE,
      { wilayaId: input.wilayaId, communeId: input.communeId, deliveryType: input.deliveryType },
    );
  }
  return { deliveryFee: fee };
}

/**
 * Apply free-shipping offer override after resolveDeliveryFee.
 * Returns 0 if an active free_shipping offer applies to any product in the order.
 * Returns the original fee otherwise.
 */
export async function applyFreeShippingOffer(
  db: DB,
  fee: number,
  productIds: string[],
  productQuantities: Map<string, number>,
): Promise<number> {
  if (fee === 0 || productIds.length === 0) return fee;

  const now = new Date().toISOString();

  for (const productId of productIds) {
    const offer = await db
      .select({
        triggerQuantity: offers.triggerQuantity,
      })
      .from(offers)
      .where(
        and(
          eq(offers.triggerProductId, productId),
          eq(offers.discountType, "free_shipping"),
          eq(offers.status, "active"),
        ),
      )
      .then(first);

    if (offer) {
      const qty = productQuantities.get(productId) ?? 0;
      if (qty >= offer.triggerQuantity) {
        return 0;
      }
    }
  }

  return fee;
}
