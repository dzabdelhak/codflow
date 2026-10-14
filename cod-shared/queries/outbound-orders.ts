import { outboundOrders } from "../db/schema";
import { ulid } from "../lib/ulid";

export interface OutboundOrderInput {
  orderId: string;
  orderNumber: string;
  lines: Array<{ sku: string | null; quantity: number; unitPrice: number; catalogVersion: number | null }>;
  delivery: { type: "home" | "stop_desk"; office: string | null; fee: number | null; gridVersion: number | null };
  customer: { name: string; phone: string; wilayaId: number; communeId: string; address: string | null };
  journey: "direct" | "cart";
  campaign?: { source: string | null; medium: string | null; name: string | null; content: string | null; term: string | null } | null;
  stockNotGuaranteed: boolean;
  submittedAt: string;
  userAgent: string | null;
  deviceId?: string | null;
}

export function outboundOrderRow(input: OutboundOrderInput): typeof outboundOrders.$inferInsert {
  const sendId = ulid();
  return {
    id: sendId,
    orderId: input.orderId,
    payload: {
      sendId,
      reference: input.orderNumber,
      lines: input.lines,
      delivery: {
        type: input.delivery.type,
        office: input.delivery.office,
        fee: input.delivery.fee,
        gridVersion: input.delivery.gridVersion,
        feeToConfirm: input.delivery.fee === null,
      },
      customer: input.customer,
      journey: { kind: input.journey, campaign: input.campaign ?? null },
      stockNotGuaranteed: input.stockNotGuaranteed,
      traces: { submittedAt: input.submittedAt, userAgent: input.userAgent, deviceId: input.deviceId ?? null },
    },
  };
}
