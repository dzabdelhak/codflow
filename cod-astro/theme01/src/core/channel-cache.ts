export const CHANNEL_CACHE_PATH = "/api/channel-cache";

export function channelTag(host: string): string {
  return `channel:${host.split(":")[0].toLowerCase()}`;
}
