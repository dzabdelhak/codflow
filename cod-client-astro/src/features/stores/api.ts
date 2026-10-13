import { apiFetch } from "@/lib/api";
import type { MerchantStore } from "./store-choice";

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

export async function listMyStores(): Promise<MerchantStore[]> {
  return (await apiFetch<DataEnvelope<MerchantStore[]>>("/api/merchant/stores")).data;
}

export async function createStore(input: { name: string; subdomain: string }): Promise<MerchantStore> {
  return (
    await apiFetch<DataEnvelope<MerchantStore>>("/api/merchant/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  ).data;
}
