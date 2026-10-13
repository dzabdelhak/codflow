import { describe, expect, it } from "vitest";
import { CHANNEL_STATUSES, canTransition, nextStatuses, publicAccess } from "./lifecycle";

describe("channel lifecycle", () => {
  it("moves forward Brouillon → En configuration → Prêt à publier → Publié", () => {
    expect(canTransition("draft", "configuring")).toBe(true);
    expect(canTransition("configuring", "ready")).toBe(true);
    expect(canTransition("ready", "published")).toBe(true);
  });

  it("publishes only a channel that is ready", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("configuring", "published")).toBe(false);
  });

  it("suspends a published channel and reactivates it", () => {
    expect(canTransition("published", "suspended")).toBe(true);
    expect(canTransition("suspended", "published")).toBe(true);
  });

  it("archives from every other state, and an archived channel only goes back to draft", () => {
    for (const status of CHANNEL_STATUSES.filter((s) => s !== "archived")) {
      expect(canTransition(status, "archived")).toBe(true);
    }
    expect(nextStatuses("archived")).toEqual(["draft"]);
  });

  it("never moves to the state it is in", () => {
    for (const status of CHANNEL_STATUSES) expect(canTransition(status, status)).toBe(false);
  });

  it("serves public pages only when published; a suspended channel is unavailable, the rest unknown", () => {
    expect(publicAccess("published")).toBe("open");
    expect(publicAccess("suspended")).toBe("unavailable");
    for (const status of ["draft", "configuring", "ready", "archived"] as const) {
      expect(publicAccess(status)).toBe("hidden");
    }
  });
});
