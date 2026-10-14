import type { ChannelType } from "../../../../cod-shared/channels/types";

export const WIZARD_STEPS = ["type", "general", "products", "delivery", "template", "summary"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardDraft {
  creationKey: string;
  step: WizardStep;
  type: ChannelType;
  name: string;
  subdomain: string;
  subdomainEdited: boolean;
  productIds: string[];
  deliveryModes: { home: boolean; stopDesk: boolean };
  defaultShippingProfileId: string | null;
  templateId: string;
}

const storageKey = (userId: string) => `codflow.storeWizard.${userId}`;
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function newDraft(creationKey: string = crypto.randomUUID()): WizardDraft {
  return {
    creationKey,
    step: "type",
    type: "store",
    name: "",
    subdomain: "",
    subdomainEdited: false,
    productIds: [],
    deliveryModes: { home: true, stopDesk: true },
    defaultShippingProfileId: null,
    templateId: "theme01",
  };
}

export function loadDraft(userId: string): WizardDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as WizardDraft;
    return typeof draft?.creationKey === "string" && WIZARD_STEPS.includes(draft.step) ? { ...newDraft(draft.creationKey), ...draft } : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: WizardDraft): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {}
}

export function clearDraft(userId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {}
}

export type StepProblem = "name_required" | "subdomain_invalid" | "no_delivery_mode" | null;

export function stepProblem(draft: WizardDraft, step: WizardStep): StepProblem {
  if (step === "general") {
    if (!draft.name.trim()) return "name_required";
    if (!SUBDOMAIN.test(draft.subdomain)) return "subdomain_invalid";
  }
  if (step === "delivery" && !draft.deliveryModes.home && !draft.deliveryModes.stopDesk) return "no_delivery_mode";
  return null;
}

export function nextStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.min(WIZARD_STEPS.indexOf(step) + 1, WIZARD_STEPS.length - 1)];
}

export function previousStep(step: WizardStep): WizardStep {
  return WIZARD_STEPS[Math.max(WIZARD_STEPS.indexOf(step) - 1, 0)];
}

export function withLiveProducts(draft: WizardDraft, catalogue: readonly { id: string; deletedAt?: string | null }[]): WizardDraft {
  const live = new Set(catalogue.filter((p) => !p.deletedAt).map((p) => p.id));
  const productIds = draft.productIds.filter((id) => live.has(id));
  return productIds.length === draft.productIds.length ? draft : { ...draft, productIds };
}

export type CreationRequest = ReturnType<typeof creationRequest>;

export function creationRequest(draft: WizardDraft) {
  return {
    type: draft.type,
    name: draft.name.trim(),
    subdomain: draft.subdomain,
    creationKey: draft.creationKey,
    productIds: draft.productIds,
    deliveryModes: draft.deliveryModes,
    defaultShippingProfileId: draft.defaultShippingProfileId,
    templateId: draft.templateId,
  };
}

export function stepForError(code: string | undefined, field: unknown): WizardStep {
  if (code === "INVALID_SUBDOMAIN" || code === "SUBDOMAIN_TAKEN") return "general";
  if (field === "productIds") return "products";
  if (field === "defaultShippingProfileId" || field === "deliveryModes") return "delivery";
  if (field === "templateId") return "template";
  return "summary";
}
