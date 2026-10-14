import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  creationRequest,
  loadDraft,
  newDraft,
  nextStep,
  previousStep,
  saveDraft,
  stepForError,
  stepProblem,
  withLiveProducts,
} from "./wizard-model";

beforeEach(() => {
  const storage = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  };
});

describe("store creation wizard", () => {
  it("walks type → general → products → delivery → template → summary", () => {
    expect(nextStep("type")).toBe("general");
    expect(nextStep("template")).toBe("summary");
    expect(nextStep("summary")).toBe("summary");
    expect(previousStep("general")).toBe("type");
    expect(previousStep("type")).toBe("type");
  });

  it("asks for a name and a valid subdomain before leaving general information", () => {
    const draft = newDraft("key-1");
    expect(stepProblem(draft, "general")).toBe("name_required");
    expect(stepProblem({ ...draft, name: "Nour", subdomain: "N" }, "general")).toBe("subdomain_invalid");
    expect(stepProblem({ ...draft, name: "Nour", subdomain: "nour" }, "general")).toBeNull();
  });

  it("needs at least one delivery mode", () => {
    expect(stepProblem({ ...newDraft("k"), deliveryModes: { home: false, stopDesk: false } }, "delivery")).toBe("no_delivery_mode");
  });

  it("keeps the draft, creation key included, so a failed or interrupted creation resumes", () => {
    const draft = { ...newDraft("key-resume"), name: "Nour", step: "summary" as const };
    saveDraft("u1", draft);
    expect(loadDraft("u1")).toMatchObject({ creationKey: "key-resume", name: "Nour", step: "summary" });
    clearDraft("u1");
    expect(loadDraft("u1")).toBeNull();
  });

  it("keeps each user's draft apart on a shared browser", () => {
    saveDraft("u1", { ...newDraft("key-u1"), name: "Nour" });
    expect(loadDraft("u2")).toBeNull();
    expect(loadDraft("u1")).toMatchObject({ creationKey: "key-u1" });
  });

  it("drops selected products that left the catalogue, so a retry is not refused for them", () => {
    const draft = { ...newDraft("k"), productIds: ["p1", "gone", "p2"] };
    const kept = withLiveProducts(draft, [{ id: "p1" }, { id: "p2" }, { id: "gone", deletedAt: "2026-10-01" }]);
    expect(kept.productIds).toEqual(["p1", "p2"]);
    expect(withLiveProducts(kept, [{ id: "p1" }, { id: "p2" }])).toBe(kept);
  });

  it("sends the same creation key on every attempt", () => {
    const draft = { ...newDraft("key-same"), name: " Nour ", subdomain: "nour", productIds: ["p1"] };
    expect(creationRequest(draft)).toMatchObject({ creationKey: "key-same", name: "Nour", productIds: ["p1"], type: "store" });
  });

  it("sends the merchant back to the step that holds the faulty answer", () => {
    expect(stepForError("SUBDOMAIN_TAKEN", undefined)).toBe("general");
    expect(stepForError("VALIDATION_FAILED", "productIds")).toBe("products");
    expect(stepForError("VALIDATION_FAILED", "defaultShippingProfileId")).toBe("delivery");
    expect(stepForError("STORE_LIMIT_REACHED", undefined)).toBe("summary");
  });
});
