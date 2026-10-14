/**
 * Keeps `inArray(column, ids)` over user-supplied ids to a bounded number of
 * bound parameters per statement (a basket, a page, a bulk action), so one
 * request can never build an arbitrarily large statement.
 */

/** What we actually pack into one `inArray`, leaving room for other params. */
export const MAX_IN_ARRAY_IDS = 90;

/**
 * Split ids into `inArray`-sized chunks. An empty input yields no chunks, so
 * callers can spread the result into a batch without guarding for it.
 */
export function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IN_ARRAY_IDS) {
    chunks.push(ids.slice(i, i + MAX_IN_ARRAY_IDS));
  }
  return chunks;
}
