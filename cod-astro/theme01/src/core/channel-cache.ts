export const CHANNEL_CACHE_PATH = "/api/channel-cache";

export function channelTag(host: string): string {
  return `channel:${host.split(":")[0].toLowerCase()}`;
}

const MAX_TRACKED = 1000;
const purged = new Set<string>();

export function shouldPurge(tag: string, open: boolean): boolean {
  if (open) {
    purged.delete(tag);
    return false;
  }
  if (purged.has(tag)) return false;
  if (purged.size >= MAX_TRACKED) purged.clear();
  purged.add(tag);
  return true;
}
