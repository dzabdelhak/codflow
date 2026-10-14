/**
 * Which pixel the storefront fires at.
 *
 * These invariants live in page frontmatter and in inline scripts, so no unit
 * test can reach them and `astro check` is happy either way — the same class
 * of gap `page-contracts.test.ts` exists for.
 *
 * What they protect: Meta deduplicates a browser event against its server
 * mirror only when both reached the SAME pixel id (capi-deduplication.md). If
 * this theme ever decides a pixel for itself — from a slug in the URL, from
 * sessionStorage, from the store config on a page that has its own pixel — it
 * can pick a different one from the Conversions API, and Meta then records two
 * conversions in two ad accounts instead of merging them into one.
 *
 * So the rule is: the theme RENDERS a pixel the server resolved. It never
 * works one out.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(resolve(SRC, relativePath), "utf8");
}

/** The identifier a page hands to StoreLayout — what BaseHead initialises. */
function layoutConfigOf(source: string): string {
  const match = source.match(/<StoreLayout[\s\S]*?config=\{([A-Za-z0-9_$.]+)\}/);
  expect(match, "page must pass a config to StoreLayout").not.toBeNull();
  return match![1];
}

const landingPage = read("pages/lp/[slug].astro");
const thankYou = read("pages/thank-you.astro");
const themeScripts = ["theme/scripts/product.ts", "theme/scripts/pixel.ts", "theme/scripts/cart-ui.ts", "theme/scripts/checkout.ts"].map(
  (path) => [path, read(path)] as const,
);
const tracker = read("core/tracking/track.ts");

describe("the landing page", () => {
  it("renders the pixel the server resolved for it, not the store's", () => {
    // `lp.tracking` is computed by cod-shared inside the batch this page
    // already runs. Falling back to `config.pixelId` here would put a page
    // with its own pixel back on the store's.
    expect(landingPage).toMatch(/lp\.tracking/);
  });

  it("does not fall back to the bare store config for either", () => {
    expect(layoutConfigOf(landingPage)).not.toBe("config");
  });
});

describe("the thank-you page", () => {
  it("asks the server which pixel this order belongs to", () => {
    // The page knows the order id and nothing else. Attribution is
    // best-effort server-side, so any slug it might read from the URL could
    // name a pixel the server never recorded against this order.
    expect(thankYou).toMatch(/fetchOrderTracking/);
  });

  it("does not decide the pixel from the store config", () => {
    expect(thankYou).not.toMatch(/config\.pixelId/);
  });

  it("does not re-implement the conversion-stage rule", () => {
    // It used to map conversionEvent → the browser event inline, a second
    // copy of resolveConversionForStage. The endpoint now returns the
    // decision, so the copy is gone and cannot drift.
    expect(thankYou).not.toMatch(/Purchase_Confirmed/);
    expect(thankYou).not.toMatch(/config\.conversionEvent/);
  });

  it("fires the sale with the event the server chose for each tracker", () => {
    expect(thankYou).toMatch(/tracking\?\.events/);
    expect(thankYou).toMatch(/track\("Purchase"/);
  });

  it("still ties the browser event to the order id for deduplication", () => {
    // The server-side conversion uses the order id as its event id; the
    // browser must send the same id, or the conversion counts twice.
    expect(thankYou).toMatch(/eventId: data\.orderId/);
  });
});

describe("theme scripts", () => {
  it("fire through the core tracker, never at a provider directly", () => {
    // The core tracker fires at the pixels the head loaded — the ones the
    // server resolved for this page — so a script cannot pick another one.
    for (const [path, source] of themeScripts) {
      expect(source, path).not.toMatch(/\b(fbq|ttq|snaptr|gtag)\s*\(/);
    }
  });

  it("reach Meta at one named pixel", () => {
    // trackSingle rather than track: a second pixel initialised on the page
    // later could not silently start receiving the same events.
    expect(tracker).toMatch(/"trackSingle",\s*t\.meta/);
  });
});
