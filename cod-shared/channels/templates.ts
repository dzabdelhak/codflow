import type { ChannelType } from "./types";

export interface ChannelTemplate {
  id: string;
  type: ChannelType;
}

export const CHANNEL_TEMPLATES: readonly ChannelTemplate[] = [{ id: "theme01", type: "store" }];

export function isTemplateFor(type: ChannelType, templateId: string): boolean {
  return CHANNEL_TEMPLATES.some((t) => t.type === type && t.id === templateId);
}
