export interface OrderAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  ttclid?: string;
  fbclid?: string;
  ttp?: string;
  scid?: string;
  gaClientId?: string;
  consent?: boolean;
}

export const ATTRIBUTION_TEXT_FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "gclid",
  "ttclid",
  "fbclid",
  "ttp",
  "scid",
  "gaClientId",
] as const;

export function attributionColumns(a: OrderAttribution | undefined) {
  const cookies = { ttp: a?.ttp, scid: a?.scid, gaClientId: a?.gaClientId };
  const hasCookies = Object.values(cookies).some(Boolean);
  return {
    utmSource: a?.utmSource ?? null,
    utmMedium: a?.utmMedium ?? null,
    utmCampaign: a?.utmCampaign ?? null,
    utmContent: a?.utmContent ?? null,
    utmTerm: a?.utmTerm ?? null,
    gclid: a?.gclid ?? null,
    ttclid: a?.ttclid ?? null,
    fbclid: a?.fbclid ?? null,
    adCookies: hasCookies ? JSON.parse(JSON.stringify(cookies)) : null,
    trackingConsent: a?.consent ?? null,
  };
}

export function campaignOf(a: OrderAttribution | undefined) {
  if (!a?.utmSource && !a?.utmCampaign && !a?.utmMedium) return null;
  return {
    source: a.utmSource ?? null,
    medium: a.utmMedium ?? null,
    name: a.utmCampaign ?? null,
    content: a.utmContent ?? null,
    term: a.utmTerm ?? null,
  };
}
