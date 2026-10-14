export const CHANNEL_TYPES = ["store", "landing"] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const AVAILABLE_CHANNEL_TYPES: readonly ChannelType[] = ["store", "landing"];

export function isChannelType(value: unknown): value is ChannelType {
  return (CHANNEL_TYPES as readonly unknown[]).includes(value);
}

export const UNAVAILABLE_RULES = ["hide_order_form", "show_unavailable", "suspend"] as const;

export type UnavailableRule = (typeof UNAVAILABLE_RULES)[number];
