/**
 * Rich-text description storage on PostgreSQL. Proves:
 *   • hostile HTML is sanitised at the write chokepoint before it is stored
 *   • `text` descriptions pass through byte-for-byte (legacy parity)
 *   • create without descriptionFormat lands as 'text' (DB default parity)
 *   • format round-trips, and a text→html flip re-sanitises the STORED value
 *   • legacy rows (inserted without the column) keep description + 'text'
 *   • T2 invariant: no reader ever returns the hostile payload unfiltered
 *   • the MCP create/update path sanitises identically
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { createNewProductSchema, updateProductDetailsSchema } from "./ai-tools";
import {
  createProduct,
  updateProduct,
  getProductById,
  getAllProducts,
} from "../../../../cod-shared/queries/products";
import { getStoreProductByHandle, getStoreProducts } from "../../../../cod-shared/queries/store";

const FUNCTIONS = { createProduct, updateProduct, getProductById, getAllProducts, getStoreProductByHandle, getStoreProducts };

const HOSTILE_HTML =
  '<p>Size <strong>10cm</strong> &amp; up</p><script>alert(1)</script>' +
  '<img src="https://m.example/i.jpg" alt="chart" onerror="alert(1)">' +
  '<a href="javascript:alert(1)" class="cta">bad link</a>';

const BASE_PRODUCT = {
  name: "Rich Text Product",
  price: 4500,
  type: "PHYSICAL" as const,
  hasVariants: false,
  sku: "RT-001",
  inventory: 10,
  trackInventory: true,
  visibility: true,
  status: "ACTIVE" as const,


};

let harness: TestDb;

async function call<T>(fn: keyof typeof FUNCTIONS, ...args: unknown[]): Promise<T> {
  const result = await (FUNCTIONS[fn] as (...a: unknown[]) => Promise<unknown>)(harness.db, ...args);
  return JSON.parse(JSON.stringify(result)) as T;
}

function assertClean(value: unknown): void {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  expect(s, "hostile payload leaked").not.toContain("<script");
  expect(s, "hostile payload leaked").not.toContain("onerror");
  expect(s, "hostile payload leaked").not.toContain("javascript:");
}

/**
 * T2 applies to STORED HTML payloads. A `text` row legitimately holds
 * markup-looking characters as inert literal text (legacy parity) — only its
 * `descriptionPlain` must stay tag-free, and for text rows descriptionPlain
 * IS the raw column, so only html rows are scanned here.
 */
function assertRowClean(row: Record<string, unknown>): void {
  if (row.descriptionFormat === "html") {
    assertClean(row.description);
    assertClean(row.descriptionPlain);
  }
}

beforeAll(async () => {
  harness = await createTestDb();

  const probe = await harness.db.execute(sql`
    INSERT INTO products (id, name, description, handle, currency, price, has_variants, inventory, track_inventory, low_stock_threshold, visibility, status, deleted_at, created_at, updated_at)
    VALUES ('legacy-row-1', 'Legacy Product', 'Size < 10cm & <b>bold</b> literal', 'legacy-row-1', 'DZD', 2000, false, 5, true, 5, true, 'ACTIVE', NULL, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')
    RETURNING description_format`);
  expect((probe as unknown as { rows: Array<{ description_format: string }> }).rows[0]?.description_format).toBe("text");
}, 120_000);

afterAll(async () => {
  await harness?.dispose();
});

describe("write chokepoint (plan §5.2)", () => {
  it("sanitises hostile HTML on create and stores format 'html'", async () => {
    const product = await call<Record<string, unknown>>("createProduct", {
      ...BASE_PRODUCT,
      description: HOSTILE_HTML,
      descriptionFormat: "html",
    });

    expect(product.descriptionFormat).toBe("html");
    const description = product.description as string;
    assertClean(description);
    expect(description).toContain('<p>Size <strong>10cm</strong> &amp; up</p>');
    expect(description).toContain('src="https://m.example/i.jpg"');
    expect(description).toContain('loading="lazy"');
    expect(description).toContain('referrerpolicy="no-referrer"');
    expect(description).toContain('rel="noopener noreferrer nofollow"');
    // href dropped, link text kept
    expect(description).toContain(">bad link</a>");
    expect(description).not.toContain("javascript:");
  });

  it("passes a 'text' description through byte-for-byte (legacy parity)", async () => {
    const raw = "Size < 10cm & <b>bold</b> literal <script>nope</script>";
    const product = await call<Record<string, unknown>>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-TEXT",
      handle: "rt-text",
      description: raw,
      descriptionFormat: "text",
    });

    expect(product.descriptionFormat).toBe("text");
    expect(product.description).toBe(raw);
    expect(product.descriptionPlain).toBe(raw);
  });

  it("defaults create without descriptionFormat to 'text' (DB default parity)", async () => {
    const product = await call<Record<string, unknown>>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-DEFAULT",
      handle: "rt-default",
      description: "<p>plain-ish</p>",
    });
    expect(product.descriptionFormat).toBe("text");
    expect(product.description).toBe("<p>plain-ish</p>");
  });

  it("round-trips the format: html → text keeps the stored value, text → html re-sanitises it", async () => {
    const created = await call<{ id: string; description: string }>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-FLIP",
      handle: "rt-flip",
      description: HOSTILE_HTML,
      descriptionFormat: "html",
    });
    const sanitisedStored = created.description;

    // html → text: the stored value is not reinterpreted or rewritten.
    const asText = await call<Record<string, unknown>>("updateProduct", created.id, {
      descriptionFormat: "text",
    });
    expect(asText.descriptionFormat).toBe("text");
    expect(asText.description).toBe(sanitisedStored);

    // text → html WITHOUT a new description: the STORED value is sanitised,
    // so legacy raw text can never start rendering as live markup.
    const asHtml = await call<Record<string, unknown>>("updateProduct", created.id, {
      descriptionFormat: "html",
    });
    expect(asHtml.descriptionFormat).toBe("html");
    assertClean(asHtml.description);
  });

  it("re-sanitises on every html description update", async () => {
    const created = await call<{ id: string }>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-UPD",
      handle: "rt-upd",
      description: "<p>clean</p>",
      descriptionFormat: "html",
    });
    const updated = await call<Record<string, unknown>>("updateProduct", created.id, {
      description: '<p>v2</p><iframe src="https://evil.example"></iframe>',
      descriptionFormat: "html",
    });
    expect(updated.description).toBe("<p>v2</p>");
  });

  it("update without description fields skips sanitising entirely (status-only updates)", async () => {
    const created = await call<{ id: string; description: string | null }>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-STATUS",
      handle: "rt-status",
      description: null,
    });
    const updated = await call<Record<string, unknown>>("updateProduct", created.id, {
      status: "DRAFT",
    });
    expect(updated.descriptionFormat).toBe("text");
    expect(updated.description).toBeNull();
    expect(updated.status).toBe("DRAFT");
  });
});

describe("legacy rows render unchanged (plan §7)", () => {
  it("a row inserted without description_format keeps description byte-for-byte as 'text'", async () => {
    const product = await call<Record<string, unknown>>("getProductById", "legacy-row-1");
    expect(product).not.toBeNull();
    expect(product.descriptionFormat).toBe("text");
    expect(product.description).toBe("Size < 10cm & <b>bold</b> literal");
    expect(product.descriptionPlain).toBe("Size < 10cm & <b>bold</b> literal");
  });
});

describe("T2 invariant — no reader returns the hostile payload", () => {
  let handle: string;
  let id: string;

  beforeAll(async () => {
    const product = await call<{ id: string; handle: string }>("createProduct", {
      ...BASE_PRODUCT,
      sku: "RT-T2",
      handle: "rt-t2-hostile",
      description: HOSTILE_HTML,
      descriptionFormat: "html",
    });
    id = product.id;
    handle = product.handle;
  });

  it("merchant detail (getProductById)", async () => {
    const product = await call<Record<string, unknown>>("getProductById", id);
    expect(product).not.toBeNull();
    assertClean(product);
    expect(product.descriptionPlain).toBe("Size 10cm & up bad link");
  });

  it("merchant list (getAllProducts)", async () => {
    const rows = await call<Record<string, unknown>[]>("getAllProducts", { search: "Rich Text Product" });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) assertRowClean(row);
  });

  it("store detail (getStoreProductByHandle)", async () => {
    const product = await call<Record<string, unknown>>("getStoreProductByHandle", handle);
    expect(product).not.toBeNull();
    assertClean(product);
    expect(product.descriptionFormat).toBe("html");
    expect(product.descriptionPlain).toBe("Size 10cm & up bad link");
  });

  it("store list (getStoreProducts)", async () => {
    const rows = await call<Record<string, unknown>[]>("getStoreProducts", {});
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) assertRowClean(row);
    const t2 = rows.find((r) => r.handle === handle);
    expect(t2).toBeDefined();
    expect((t2 as Record<string, unknown>).descriptionPlain).toBe("Size 10cm & up bad link");
  });
});

/**
 * The MCP tools execute the repo's two-layer pattern: Layer 2 validation with
 * the EXACT schemas the tools/list advertisement is derived from
 * (PRODUCT_TOOL_SCHEMAS re-exports createProductSchema/updateProductSchema),
 * then the same queries.* write path. This suite drives both real layers
 * directly: the shared schemas parse, then the parsed data is dispatched
 * through the real write path.
 */
describe("MCP tool path sanitises identically (plan §7)", () => {
  it("createNewProduct: shared schema accepts then the write path sanitises agent HTML", async () => {
    const toolArgs = {
      ...BASE_PRODUCT,
      sku: "MCP-001",
      handle: "mcp-001",
      description: HOSTILE_HTML,
      descriptionFormat: "html" as const,
    };
    const parsed = createNewProductSchema.safeParse(toolArgs);
    expect(parsed.success).toBe(true);

    const product = await call<Record<string, unknown>>(
      "createProduct",
      parsed.data,
    );

    expect(product.descriptionFormat).toBe("html");
    assertClean(product.description);
    expect(product.descriptionPlain).toBe("Size 10cm & up bad link");
  });

  it("updateProductDetails: shared schema accepts then the write path sanitises agent HTML", async () => {
    const created = await call<{ id: string }>("createProduct", {
      ...BASE_PRODUCT,
      sku: "MCP-002",
      handle: "mcp-002",
      description: null,
    });
    const toolArgs = {
      productId: created.id,
      updates: {
        description: '<p>mcp</p><svg onload="alert(1)"></svg>',
        descriptionFormat: "html" as const,
      },
    };
    const parsed = updateProductDetailsSchema.safeParse(toolArgs);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("unreachable");

    const product = await call<Record<string, unknown>>(
      "updateProduct",
      parsed.data.productId,
      parsed.data.updates,
    );

    expect(product.description).toBe("<p>mcp</p>");
    expect(product.descriptionFormat).toBe("html");
  });

  it("rejects an over-cap description through the shared schema (MCP layer-2)", () => {
    const result = createNewProductSchema.safeParse({
      ...BASE_PRODUCT,
      sku: "MCP-003",
      description: "a".repeat(100_001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "description");
      expect(issue?.message).toContain("100,000");
    }
  });
});
