/// <reference types="vitest/globals" />
import { attributionFromUrl, mergeAttribution } from "./attribution";

describe("the visit's attribution", () => {
  it("reads UTMs and ad click ids from the landing URL", () => {
    expect(attributionFromUrl("?utm_source=facebook&utm_medium=cpc&utm_campaign=ramadan&fbclid=IwAR1&gclid=Cj0&ttclid=E.C&other=x")).toEqual({
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "ramadan",
      fbclid: "IwAR1",
      gclid: "Cj0",
      ttclid: "E.C",
    });
  });

  it("is kept for the session, and replaced only by a visit that brings its own", () => {
    const first = { utmSource: "facebook", utmCampaign: "ramadan" };
    expect(mergeAttribution(first, {})).toEqual(first);
    expect(mergeAttribution(first, { utmSource: "tiktok" })).toEqual({ utmSource: "tiktok" });
  });

  it("remembers when the ad click id was first seen, for Meta's fbc", () => {
    const landed = mergeAttribution({}, { fbclid: "IwAR1" }, 1700000000000);
    expect(landed).toEqual({ fbclid: "IwAR1", fbclidAt: "1700000000000" });
    expect(mergeAttribution(landed, {}, 1700000999999)).toEqual(landed);
  });
});
