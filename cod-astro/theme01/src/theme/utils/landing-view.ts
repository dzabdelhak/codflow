import type { LandingChannel, StoreConfig } from "@/core/api/types";

export function isLandingChannel(config: Pick<StoreConfig, "channelType">): boolean {
  return config.channelType === "landing";
}

export type LandingOrderSection = "form" | "unavailable" | "none";

export function landingOrderSection(landing: Pick<LandingChannel, "available" | "unavailableRule">): LandingOrderSection {
  if (landing.available) return "form";
  return landing.unavailableRule === "hide_order_form" ? "none" : "unavailable";
}

export function filledTexts(...texts: Array<string | null | undefined>): string[] {
  return texts.map((t) => t?.trim() ?? "").filter((t) => t.length > 0);
}
