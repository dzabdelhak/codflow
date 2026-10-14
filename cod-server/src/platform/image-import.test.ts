import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createTestDb, TEST_MERCHANT_ID, TEST_STORE_ID, type TestDb } from "@/test-utils/pg";
import { memoryImageStore } from "./image-store";
import { importLegacyImages } from "./image-import";

const OLD = "https://media.example.com";
const NEW = "https://api.example.com/images";
let harness: TestDb;
let jpeg: Uint8Array;

beforeAll(async () => {
  harness = await createTestDb();
  jpeg = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#123456" } }).jpeg().toBuffer());
  const now = "2026-01-01T00:00:00.000Z";
  await harness.platform.query(
    `insert into products (id, merchant_id, name, description, description_format, handle, price, created_at, updated_at)
     values ('p1', $1, 'P', $2, 'html', 'p1', 1000, $3, $3)`,
    [TEST_MERCHANT_ID, `<img src="${OLD}/products/inline.jpg">`, now],
  );
  await harness.platform.query(
    `insert into product_images (id, merchant_id, product_id, src, r2_key, type, position, created_at, updated_at)
     values ('i1', $1, 'p1', $2, 'products/gallery.jpg', 1, 1, $3, $3), ('i2', $1, 'p1', $4, 'products/gone.jpg', 1, 2, $3, $3)`,
    [TEST_MERCHANT_ID, `${OLD}/products/gallery.jpg`, now, `${OLD}/products/gone.jpg`],
  );
  await harness.platform.query("update stores set logo_url = $1 where id = $2", [`${OLD}/products/logo.png`, TEST_STORE_ID]);
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

describe("importing images from the old media domain", () => {
  it("copies every referenced image it can download, reports the missing ones, and rewrites the stored URLs", async () => {
    const store = memoryImageStore();
    const fetched: string[] = [];
    const download = async (url: string) => {
      fetched.push(url);
      return url.endsWith("gone.jpg") ? new Response("no", { status: 404 }) : new Response(jpeg);
    };

    const report = await importLegacyImages(harness.platform, store, { oldBase: OLD, newBase: NEW, download });

    expect(report).toMatchObject({ referenced: 4, copied: 3, alreadyStored: 0, missing: ["products/gone.jpg"] });
    expect(store.objects.get("products/gallery.jpg")?.contentType).toBe("image/jpeg");
    const { rows: [image] } = await harness.platform.query("select src from product_images where id = 'i1'");
    const { rows: [product] } = await harness.platform.query("select description from products where id = 'p1'");
    const { rows: [shop] } = await harness.platform.query("select logo_url from stores where id = $1", [TEST_STORE_ID]);
    expect(image.src).toBe(`${NEW}/products/gallery.jpg`);
    expect(product.description).toBe(`<img src="${NEW}/products/inline.jpg">`);
    expect(shop.logo_url).toBe(`${NEW}/products/logo.png`);

    const again = await importLegacyImages(harness.platform, store, { oldBase: OLD, newBase: NEW, download });
    expect(again).toMatchObject({ copied: 0, alreadyStored: 3, rowsRewritten: 0 });
  });
});
