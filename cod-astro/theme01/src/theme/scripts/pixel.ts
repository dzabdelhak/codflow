import { track } from "@/core/tracking/track";
import type { CartLine } from "./cart";

function itemsOf(lines: CartLine[]) {
  return lines.map((line) => ({ id: line.productId, quantity: line.quantity, price: line.unitPrice }));
}

function valueOf(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
}

export function trackAddToCart(lines: CartLine[]): void {
  if (lines.length === 0) return;
  track("AddToCart", { items: itemsOf(lines), value: valueOf(lines) });
}

export function trackInitiateCheckout(lines: CartLine[], value: number): void {
  if (lines.length === 0) return;
  track("InitiateCheckout", { items: itemsOf(lines), value });
}
