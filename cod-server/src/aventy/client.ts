import type { AventyDomain } from "../../../cod-shared/db/schema";
import type { DestinationAnswer } from "@/platform/outbound/destination";
import { demoAventyClient } from "./demo-client";

export interface AventyProductCopy {
  id: string;
  version: number;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  category: { id: string; name: string } | null;
  images: string[];
  sku: string | null;
  reserve: number;
  variants: Array<{ sku: string; options: Record<string, string>; price: number | null; reserve: number }>;
}

export interface AventyDeliveryGrid {
  version: number;
  rules: Array<{ wilayaId: number; home: number | null; stopDesk: number | null }>;
}

export interface AventyClient {
  heartbeat(key: string): Promise<{ changed: AventyDomain[] }>;
  catalogueSnapshot(key: string): Promise<{ cursor: string; products: AventyProductCopy[] }>;
  catalogueChanges(key: string, cursor: string): Promise<{ cursor: string; products: AventyProductCopy[]; removed: string[] } | "cursor_expired">;
  deliveryGrid(key: string): Promise<{ cursor: string; grid: AventyDeliveryGrid }>;
  sendOrder(key: string, order: { sendId: string; payload: unknown }): Promise<DestinationAnswer>;
}

export class AventyUnauthorizedError extends Error {}

export class AventyPermissionError extends Error {
  constructor(readonly domain: AventyDomain | "orders") {
    super(`The Aventy key has no permission for ${domain}`);
  }
}

export function aventyClientFromEnv(env: Record<string, string | undefined>): AventyClient | null {
  return env.AVENTY_DEMO === "1" ? demoAventyClient() : null;
}
