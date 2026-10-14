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
});
