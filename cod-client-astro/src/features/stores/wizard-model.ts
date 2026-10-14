import type { ChannelType, UnavailableRule } from "../../../../cod-shared/channels/types";
import { defaultTemplateFor } from "../../../../cod-shared/channels/templates";

export const WIZARD_STEPS = ["type", "general", "products", "delivery", "template", "summary"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardDraft {
  creationKey: string;
  step: WizardStep;
  type: ChannelType;
  name: string;
  subdomain: string;
  subdomainEdited: boolean;
  customDomain: string;
  productIds: string[];
  deliveryModes: { home: boolean; stopDesk: boolean };
  defaultShippingProfileId: string | null;
  templateId: string;
  unavailableRule: UnavailableRule;
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
    customDomain: "",
    productIds: [],
    deliveryModes: { home: true, stopDesk: true },
    defaultShippingProfileId: null,
    templateId: "theme01",
    unavailableRule: "show_unavailable",
  };
}

export function withType(draft: WizardDraft, type: ChannelType): WizardDraft {
  return {
    ...draft,
    type,
    templateId: defaultTemplateFor(type),
    productIds: type === "landing" ? draft.productIds.slice(0, 1) : draft.productIds,
  };
}

export function toggleProduct(draft: WizardDraft, productId: string): WizardDraft {
  if (draft.type === "landing") return { ...draft, productIds: [productId] };
  const productIds = draft.productIds.includes(productId)
    ? draft.productIds.filter((id) => id !== productId)
    : [...draft.productIds, productId];
  return { ...draft, productIds };
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

export type StepProblem = "name_required" | "subdomain_invalid" | "domain_invalid" | "main_product_required" | "no_delivery_mode" | null;

const DOMAIN = /^(?:https?:\/\/)?[^\s/.]+(?:\.[^\s/.]+)+\/?$/i;

export function stepProblem(draft: WizardDraft, step: WizardStep): StepProblem {
  if (step === "general") {
    if (!draft.name.trim()) return "name_required";
    if (!SUBDOMAIN.test(draft.subdomain)) return "subdomain_invalid";
    if (draft.customDomain.trim() && !DOMAIN.test(draft.customDomain.trim())) return "domain_invalid";
  }
  if (step === "products" && draft.type === "landing" && draft.productIds.length !== 1) return "main_product_required";
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
    customDomain: draft.customDomain.trim() || undefined,
    creationKey: draft.creationKey,
    productIds: draft.productIds,
    deliveryModes: draft.deliveryModes,
    defaultShippingProfileId: draft.defaultShippingProfileId,
    templateId: draft.templateId,
    unavailableRule: draft.type === "landing" ? draft.unavailableRule : undefined,
  };
}

export function stepForError(code: string | undefined, field: unknown): WizardStep {
  if (code === "INVALID_SUBDOMAIN" || code === "SUBDOMAIN_TAKEN" || field === "customDomain") return "general";
  if (field === "productIds") return "products";
  if (field === "defaultShippingProfileId" || field === "deliveryModes") return "delivery";
  if (field === "templateId") return "template";
  return "summary";
}
