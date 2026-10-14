import { describe, expect, it } from "vitest";
import { channelTag, shouldPurge } from "./channel-cache";

describe("channelTag", () => {
  it("names a channel by its hostname, without port, in lower case", () => {
    expect(channelTag("Shop2.localhost:8090")).toBe("channel:shop2.localhost");
    expect(channelTag("boutique.dz")).toBe("channel:boutique.dz");
  });
});

describe("shouldPurge", () => {
  it("purges a closed channel's pages once, not on every request", () => {
    expect(shouldPurge("channel:a.test", false)).toBe(true);
    expect(shouldPurge("channel:a.test", false)).toBe(false);
  });

  it("purges again once the channel was open in between", () => {
    shouldPurge("channel:b.test", false);
    expect(shouldPurge("channel:b.test", true)).toBe(false);
    expect(shouldPurge("channel:b.test", false)).toBe(true);
  });
});
