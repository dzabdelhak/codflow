/**
 * Funnel events for the cart, fired at every tracker the page loaded through
 * the core tracker (Meta, TikTok, Snap, GA4). A store without trackers sends
 * nothing.
 *
 * `value` is always money the server agrees with where we have it.
 */

import { track } from "@/core/tracking/track";
import type { CartLine } from "./cart";

function itemsOf(lines: CartLine[]) {
  return lines.map((line) => ({ id: line.productId, quantity: line.quantity, price: line.unitPrice }));
}

function valueOf(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
}

/**
 * What the shopper just put in the basket — not the whole basket, which would
 * double-count everything already in it.
 */
export function trackAddToCart(lines: CartLine[]): void {
  if (lines.length === 0) return;
  track("AddToCart", { items: itemsOf(lines), value: valueOf(lines) });
}

/** The shopper started checking out with this basket, at the server-validated subtotal. */
export function trackInitiateCheckout(lines: CartLine[], value: number): void {
  if (lines.length === 0) return;
  track("InitiateCheckout", { items: itemsOf(lines), value });
}
