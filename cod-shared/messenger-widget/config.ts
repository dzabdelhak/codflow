export type MessengerPosition = "right" | "left";

export interface MessengerWidgetConfig {
  enabled: boolean;
  /** The Facebook page's username (facebook.com/<username>) or numeric id. */
  page: string;
  position: MessengerPosition;
  /** Optional text beside the button; empty shows the icon alone. */
  label: string;
}

export interface StorefrontMessengerWidget {
  url: string;
  position: MessengerPosition;
  label: string | null;
}

export const MESSENGER_POSITIONS: readonly MessengerPosition[] = ["right", "left"];
export const MESSENGER_LIMITS = { MAX_PAGE_LENGTH: 80, MAX_LABEL_LENGTH: 40 } as const;

export const DEFAULT_MESSENGER_WIDGET: MessengerWidgetConfig = { enabled: false, page: "", position: "right", label: "" };

const PAGE = /^[A-Za-z0-9.]{3,80}$/;

export function normalisePage(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com|fb\.com|m\.me)\//i, "")
    .replace(/^profile\.php\?id=/i, "")
    .split(/[/?#]/)[0]
    .replace(/^@/, "");
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function parseMessengerWidgetConfig(json: string | null | undefined): MessengerWidgetConfig {
  if (typeof json !== "string" || json.trim() === "") return DEFAULT_MESSENGER_WIDGET;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_MESSENGER_WIDGET;
  }
  if (!isRecord(raw)) return DEFAULT_MESSENGER_WIDGET;
  return {
    enabled: raw.enabled === true,
    page: typeof raw.page === "string" ? raw.page : "",
    position: raw.position === "left" ? "left" : "right",
    label: typeof raw.label === "string" ? raw.label.slice(0, MESSENGER_LIMITS.MAX_LABEL_LENGTH) : "",
  };
}

export function serializeMessengerWidgetConfig(config: MessengerWidgetConfig): string {
  return JSON.stringify({ enabled: config.enabled, page: config.page, position: config.position, label: config.label });
}

export type MessengerIssue = { path: string; message: string };

export function validateMessengerWidgetInput(input: unknown): { ok: true; config: MessengerWidgetConfig } | { ok: false; issues: MessengerIssue[] } {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", message: "Expected an object" }] };
  const issues: MessengerIssue[] = [];
  for (const key of Object.keys(input)) {
    if (!["enabled", "page", "position", "label"].includes(key)) issues.push({ path: key, message: `Unknown key: ${key}` });
  }
  const enabled = input.enabled === true;
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") issues.push({ path: "enabled", message: "Expected true or false" });
  const page = typeof input.page === "string" ? normalisePage(input.page) : "";
  if (input.page !== undefined && typeof input.page !== "string") issues.push({ path: "page", message: "Expected text" });
  else if (page !== "" && !PAGE.test(page)) issues.push({ path: "page", message: "Expected a Facebook page username or id" });
  else if (enabled && page === "") issues.push({ path: "page", message: "A Facebook page is required to show the button" });
  const position = input.position ?? "right";
  if (!(MESSENGER_POSITIONS as readonly unknown[]).includes(position)) issues.push({ path: "position", message: "Expected right or left" });
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (input.label !== undefined && typeof input.label !== "string") issues.push({ path: "label", message: "Expected text" });
  else if (label.length > MESSENGER_LIMITS.MAX_LABEL_LENGTH) issues.push({ path: "label", message: `At most ${MESSENGER_LIMITS.MAX_LABEL_LENGTH} characters` });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, config: { enabled, page, position: position as MessengerPosition, label } };
}

export function resolveStorefrontMessenger(json: string | null | undefined): StorefrontMessengerWidget | null {
  const config = parseMessengerWidgetConfig(json);
  if (!config.enabled || !PAGE.test(config.page)) return null;
  return { url: `https://m.me/${config.page}`, position: config.position, label: config.label.trim() || null };
}
