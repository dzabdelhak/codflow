import { describe, expect, it } from "vitest";
import { primaryRedirect } from "./primary-host";

describe("redirect to the primary domain", () => {
  it("sends a visitor on another domain of the channel to the primary one, same path and query", () => {
    expect(primaryRedirect(new URL("http://shop1.codflow.app/products/x?utm=fb"), "shop1.codflow.app", "https", "boutique-nour.dz")).toBe(
      "https://boutique-nour.dz/products/x?utm=fb",
    );
  });

  it("does nothing on the primary domain or without one", () => {
    expect(primaryRedirect(new URL("https://boutique-nour.dz/"), "boutique-nour.dz", "https", "boutique-nour.dz")).toBeNull();
    expect(primaryRedirect(new URL("http://shop1.localhost:8090/"), "shop1.localhost:8090", null, null)).toBeNull();
  });

  it("keeps a non-standard port, as on a local stack", () => {
    expect(primaryRedirect(new URL("http://shop1.localhost:8090/a"), "shop1.localhost:8090", null, "nour.localhost")).toBe(
      "http://nour.localhost:8090/a",
    );
  });
});
