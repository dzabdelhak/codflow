import { describe, expect, it } from "vitest";
import { previewTokenStore, signPreviewToken } from "./design-preview";

describe("design preview tokens", () => {
  it("name the store they were signed for, for an hour", () => {
    const { token } = signPreviewToken("store-a", "key", 1_000);
    expect(previewTokenStore(token, "key", 1_000 + 59 * 60 * 1000)).toBe("store-a");
    expect(previewTokenStore(token, "key", 1_000 + 61 * 60 * 1000)).toBeNull();
  });

  it("are worthless with another key, edited, or made up", () => {
    const { token } = signPreviewToken("store-a", "key", 1_000);
    const forged = Buffer.from(Buffer.from(token, "base64url").toString().replace("store-a", "store-b")).toString("base64url");
    expect(previewTokenStore(token, "other-key", 1_000)).toBeNull();
    expect(previewTokenStore(forged, "key", 1_000)).toBeNull();
    expect(previewTokenStore("garbage", "key", 1_000)).toBeNull();
  });
});
