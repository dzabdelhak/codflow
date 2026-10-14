import type { ChannelType, UnavailableRule } from "./types";

export const CHANNEL_STATUSES = ["draft", "configuring", "ready", "published", "suspended", "archived"] as const;

export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

const TRANSITIONS: Record<ChannelStatus, readonly ChannelStatus[]> = {
  draft: ["configuring", "ready", "archived"],
  configuring: ["draft", "ready", "archived"],
  ready: ["configuring", "published", "archived"],
  published: ["suspended", "archived"],
  suspended: ["published", "archived"],
  archived: ["draft"],
};

export function nextStatuses(from: ChannelStatus): readonly ChannelStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: ChannelStatus, to: ChannelStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isChannelStatus(value: string): value is ChannelStatus {
  return (CHANNEL_STATUSES as readonly string[]).includes(value);
}

export type PublicAccess = "open" | "unavailable" | "hidden";

export function publicAccess(status: ChannelStatus): PublicAccess {
  if (status === "published") return "open";
  if (status === "suspended") return "unavailable";
  return "hidden";
}

export interface PublicChannel {
  status: ChannelStatus;
  type: ChannelType;
  unavailableRule: UnavailableRule;
  mainProductAvailable: boolean;
}

export function channelPublicAccess(channel: PublicChannel): PublicAccess {
  const access = publicAccess(channel.status);
  if (access !== "open" || channel.type !== "landing") return access;
  return !channel.mainProductAvailable && channel.unavailableRule === "suspend" ? "unavailable" : "open";
}
