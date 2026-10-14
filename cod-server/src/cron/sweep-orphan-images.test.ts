/**
 * Orphan-image sweep — real PostgreSQL, in-memory image store.
 *
 * The destructive risk in this feature is deleting an object that something
 * still references, so the whole test is built around that: every reference
 * source the database has is seeded, one object per source is placed in the
 * store, and the sweep must delete exactly the unreferenced, old one (with its
 * resized variants). `landing/` objects and fresh objects must survive.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type pg from "pg";
import { createPool } from "@/db/scope";
import { createTestDb, TEST_MERCHANT_ID, type TestDb } from "@/test-utils/pg";
import { getDb } from "@/db";
import { memoryImageStore } from "@/platform/image-store";
import { collectReferencedImageKeys } from "../../../cod-shared/queries/image-references";
import { sweepOrphanImages } from "./sweep-orphan-images";

const FUTURE = new Date("2099-06-01T00:00:00.000Z");
const hex = (char: string) => char.repeat(32);
const KEYS = {
  orphan: `products/${hex("0")}.webp`,
  galleryKey: `products/${hex("1")}.webp`,
  galleryUrl: `products/${hex("2")}.webp`,
  described: `products/${hex("3")}.webp`,
  category: `products/${hex("4")}.webp`,
  landing: `landing/${hex("9")}.webp`,
};
const MANAGED_KEYS = [KEYS.orphan, KEYS.galleryKey, KEYS.galleryUrl, KEYS.described, KEYS.category];
const ORPHAN_BODY = new TextEncoder().encode("orphan-object-body");
const publicUrl = (key: string) => `https://api.example.com/images/${key}`;

let harness: TestDb;
let platform: pg.Pool;
let store: ReturnType<typeof memoryImageStore>;
const env = () => ({ DATABASE: { platform }, IMAGE_STORE: store }) as never;

beforeAll(async () => {
  harness = await createTestDb();
  platform = createPool(harness.url, "codflow_platform");
  const now = "2026-01-01T00:00:00.000Z";
  await harness.platform.query(
    `insert into products (id, merchant_id, name, description, description_format, handle, price, created_at, updated_at)
     values ('p1', $1, 'Described', $2, 'html', 'p1', 1000, $3, $3)`,
    [TEST_MERCHANT_ID, `<p>look</p><img src="${publicUrl(KEYS.described)}" alt="a">`, now],
  );
  await harness.platform.query(
    `insert into product_images (id, merchant_id, product_id, src, r2_key, type, position, created_at, updated_at) values
       ('i1', $1, 'p1', $2, $3, 1, 1, $5, $5), ('i2', $1, 'p1', $4, null, 1, 2, $5, $5)`,
    [TEST_MERCHANT_ID, publicUrl(KEYS.galleryKey), KEYS.galleryKey, publicUrl(KEYS.galleryUrl), now],
  );
  await harness.platform.query(
    `insert into product_categories (id, merchant_id, name, slug, image_url, position, created_at, updated_at)
     values ('c1', $1, 'Cat', 'cat', $2, 0, $3, $3)`,
    [TEST_MERCHANT_ID, publicUrl(KEYS.category), now],
  );
}, 120_000);

afterAll(async () => {
  await platform?.end();
  await harness?.dispose();
});

beforeEach(async () => {
  store = memoryImageStore();
  for (const key of MANAGED_KEYS) await store.put(key, key === KEYS.orphan ? ORPHAN_BODY : new TextEncoder().encode(key), "image/webp");
  await store.put(`${KEYS.orphan}~400x400-cover`, new Uint8Array(3), "image/webp");
  await store.put(`${KEYS.galleryKey}~400x400-cover`, new Uint8Array(3), "image/webp");
  await store.put(KEYS.landing, new Uint8Array(3), "image/webp");
});

const keys = (prefix = "") => [...store.objects.keys()].filter((k) => k.startsWith(prefix)).sort();

describe("collectReferencedImageKeys", () => {
  it("finds all four reference sources, bare or inside a URL, and nothing else", async () => {
    const referenced = await collectReferencedImageKeys(getDb(platform));
    expect([...referenced].sort()).toEqual([KEYS.galleryKey, KEYS.galleryUrl, KEYS.described, KEYS.category].sort());
  });
});

describe("sweepOrphanImages", () => {
  it("reports the orphan and its variant, deleting nothing on a dry run", async () => {
    const report = await sweepOrphanImages(env(), { now: FUTURE });
    expect(report).toMatchObject({ dryRun: true, deleted: 0, prefix: "products/", referenced: 4 });
    expect(report.orphans.map((o) => o.key).sort()).toEqual([KEYS.orphan, `${KEYS.orphan}~400x400-cover`].sort());
    expect(report.orphanBytes).toBe(ORPHAN_BODY.length + 3);
    expect(keys()).toHaveLength(MANAGED_KEYS.length + 3);
  });

  it("deletes exactly the orphan and its variant when deletion is enabled", async () => {
    const report = await sweepOrphanImages(env(), { dryRun: false, now: FUTURE });
    expect(report.deleted).toBe(2);
    expect(keys("products/")).toEqual(
      [...MANAGED_KEYS.filter((k) => k !== KEYS.orphan), `${KEYS.galleryKey}~400x400-cover`].sort(),
    );
    expect(keys("landing/")).toEqual([KEYS.landing]);
  });

  it("keeps an unreferenced object inside the grace period", async () => {
    const report = await sweepOrphanImages(env(), { dryRun: false });
    expect(report.orphans).toEqual([]);
    expect(keys()).toContain(KEYS.orphan);
  });
});
