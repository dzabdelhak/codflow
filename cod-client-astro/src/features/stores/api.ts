import { apiFetch } from "@/lib/api";
import type { ChannelStatus } from "../../../../cod-shared/channels/lifecycle";
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

export interface StatusChange {
  id: string;
  actorName: string;
  from: ChannelStatus;
  to: ChannelStatus;
  createdAt: string;
}

export async function changeStoreStatus(id: string, status: ChannelStatus): Promise<MerchantStore> {
  return (
    await apiFetch<DataEnvelope<MerchantStore>>(`/api/merchant/stores/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
  ).data;
}

export async function listStatusHistory(id: string): Promise<StatusChange[]> {
  return (await apiFetch<DataEnvelope<StatusChange[]>>(`/api/merchant/stores/${encodeURIComponent(id)}/status-history`)).data;
}

export async function deleteStore(id: string, confirmName: string): Promise<void> {
  await apiFetch(`/api/merchant/stores/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  });
}
