import { describe, it, expect } from "vitest";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("is 26 Crockford base32 characters", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("sorts by creation time", () => {
    expect(ulid(1_000) < ulid(2_000)).toBe(true);
    expect(ulid(1_760_000_000_000).slice(0, 10)).toBe(ulid(1_760_000_000_000).slice(0, 10));
  });

  it("is unique", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => ulid()));
    expect(ids.size).toBe(10_000);
  });
});
