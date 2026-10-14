// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ║  Keeps the visit's UTMs and ad click ids for the session, and hands  ║
// ║  them to the order form — with the ad cookies and the shopper's      ║
// ║  consent — at submit time.                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { consentDecision } from "./track";

const STORAGE_KEY = "cod_attribution";
const PARAMS: Record<string, string> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  gclid: "gclid",
  ttclid: "ttclid",
  fbclid: "fbclid",
};

export type Attribution = Record<string, string>;

export function attributionFromUrl(search: string): Attribution {
  const params = new URLSearchParams(search);
  const found: Attribution = {};
  for (const [param, field] of Object.entries(PARAMS)) {
    const value = params.get(param)?.trim();
    if (value) found[field] = value.slice(0, 300);
  }
  return found;
}

export function mergeAttribution(stored: Attribution, fresh: Attribution, now = Date.now()): Attribution {
  if (!Object.keys(fresh).length) return stored;
  return fresh.fbclid ? { ...fresh, fbclidAt: String(now) } : fresh;
}

function readStored(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Attribution;
  } catch {
    return {};
  }
}

function cookie(name: string): string | null {
  const value = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
}

export function captureAttribution(): Attribution {
  const merged = mergeAttribution(readStored(), attributionFromUrl(location.search));
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {}
  return merged;
}

function fillOrderForm(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('input[name="attribution"]');
  const { fbclidAt, ...stored } = readStored();
  const decision = consentDecision();
  if (input) {
    input.value = JSON.stringify({
      ...stored,
      ...(cookie("_ttp") ? { ttp: cookie("_ttp") } : {}),
      ...(cookie("_scid") ? { scid: cookie("_scid") } : {}),
      ...(cookie("_ga") ? { gaClientId: cookie("_ga") } : {}),
      ...(decision ? { consent: decision === "granted" } : {}),
    });
  }
  const fbc = form.querySelector<HTMLInputElement>('input[name="fbc"]');
  const fbp = form.querySelector<HTMLInputElement>('input[name="fbp"]');
  if (fbc && !fbc.value) fbc.value = cookie("_fbc") ?? (stored.fbclid ? `fb.1.${fbclidAt ?? Date.now()}.${stored.fbclid}` : "");
  if (fbp && !fbp.value) fbp.value = cookie("_fbp") ?? "";
}

if (typeof window !== "undefined") {
  captureAttribution();
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.querySelector('input[name="attribution"]')) fillOrderForm(form);
    },
    true,
  );
}
