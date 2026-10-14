export const CHANNEL_TYPES = ["store", "landing"] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const AVAILABLE_CHANNEL_TYPES: readonly ChannelType[] = ["store"];
