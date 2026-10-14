import { describe, expect, it } from "vitest";
import { aventyClientFromEnv } from "./client";

describe("choosing the Aventy client", () => {
  it("uses the demo client only outside production", () => {
    expect(aventyClientFromEnv({})).toBeNull();
    expect(aventyClientFromEnv({ AVENTY_DEMO: "1", ENVIRONMENT: "development" })?.merchantSnapshot).toBeTypeOf("function");
    expect(() => aventyClientFromEnv({ AVENTY_DEMO: "1", ENVIRONMENT: "production" })).toThrow(/production/);
  });
});
