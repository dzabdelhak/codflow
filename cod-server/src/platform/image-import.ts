import type pg from "pg";
import { getDb } from "../../../cod-shared/db/client";
import { collectReferencedImageKeys } from "../../../cod-shared/queries/image-references";
import { sniffImageType } from "@/lib/image-dimensions";
import { IMAGE_KEY } from "./image-pipeline";
import type { ImageStore } from "./image-store";

export interface LegacyImportReport {
  referenced: number;
  copied: number;
  alreadyStored: number;
  missing: string[];
  rowsRewritten: number;
}

const TEXT_COLUMNS: Array<[table: string, column: string]> = [
  ["product_images", "src"],
  ["products", "description"],
  ["product_categories", "image_url"],
  ["landing_page_images", "src"],
  ["stores", "logo_url"],
  ["stores", "og_image"],
  ["stores", "content_json"],
  ["stores", "whatsapp_widget_json"],
  ["users", "image"],
];
const JSON_COLUMNS: Array<[table: string, column: string]> = [
  ["channel_designs", "draft"],
  ["channel_design_versions", "document"],
];

async function stored(store: ImageStore, key: string): Promise<boolean> {
  return (await store.list(key)).objects.some((object) => object.key === key);
}

export async function importLegacyImages(
  platform: pg.Pool | pg.Client,
  store: ImageStore,
  { oldBase, newBase, download = (url: string) => fetch(url) }: { oldBase: string; newBase: string; download?: (url: string) => Promise<Response> },
): Promise<LegacyImportReport> {
  const from = oldBase.replace(/\/$/, "");
  const to = newBase.replace(/\/$/, "");
  const keys = [...(await collectReferencedImageKeys(getDb(platform as pg.Pool)))].filter((key) => IMAGE_KEY.test(key));
  const report: LegacyImportReport = { referenced: keys.length, copied: 0, alreadyStored: 0, missing: [], rowsRewritten: 0 };

  for (const key of keys) {
    if (await stored(store, key)) {
      report.alreadyStored++;
      continue;
    }
    const response = await download(`${from}/${key}`).catch(() => null);
    const bytes = response?.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    const type = bytes && sniffImageType(bytes);
    if (!bytes || !type) {
      report.missing.push(key);
      continue;
    }
    await store.put(key, bytes, type);
    report.copied++;
  }

  for (const [table, column] of TEXT_COLUMNS) {
    const result = await platform.query(
      `update ${table} set ${column} = replace(${column}, $1, $2) where position($1 in ${column}) > 0`,
      [`${from}/`, `${to}/`],
    );
    report.rowsRewritten += result.rowCount ?? 0;
  }
  for (const [table, column] of JSON_COLUMNS) {
    const result = await platform.query(
      `update ${table} set ${column} = replace(${column}::text, $1, $2)::jsonb where position($1 in ${column}::text) > 0`,
      [`${from}/`, `${to}/`],
    );
    report.rowsRewritten += result.rowCount ?? 0;
  }
  return report;
}
