export interface PlacedOrder {
  orderNumber: string;
  orderId?: string | null;
  total: number;
  feeToConfirm?: boolean;
}

export function thankYouUrl(order: PlacedOrder): string {
  const params = new URLSearchParams({
    order: order.orderNumber,
    total: String(order.total),
    oid: order.orderId ?? "",
  });
  if (order.feeToConfirm) params.set("fee", "confirm");
  return `/thank-you?${params}`;
}
