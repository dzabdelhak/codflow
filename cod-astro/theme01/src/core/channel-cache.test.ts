import { describe, expect, it } from "vitest";
import { channelTag } from "./channel-cache";

describe("channelTag", () => {
  it("names a channel by its hostname, without port, in lower case", () => {
    expect(channelTag("Shop2.localhost:8090")).toBe("channel:shop2.localhost");
    expect(channelTag("boutique.dz")).toBe("channel:boutique.dz");
  });
});
