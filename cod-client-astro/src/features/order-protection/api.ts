import { apiFetch } from "@/lib/api";

export type BlockedReason = "blocked_phone" | "phone_window" | "device_window" | "ip_ceiling" | "ip_flagged";

export interface BlockedAttempt {
  id: string;
  reason: BlockedReason;
  orderNumber: string;
  phone: string;
  customerName: string;
  deviceId: string | null;
  ipAddress: string | null;
  details: { lines: Array<{ productName: string; quantity: number }>; total: number | null };
  createdAt: string;
}

export interface BlockedPhone {
  id: string;
  phone: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

export async function getBlockedAttempts(limit = 200) {
  return (await apiFetch<DataEnvelope<BlockedAttempt[]>>(`/api/order-protection/attempts?limit=${limit}`)).data;
}

export async function getBlockedPhones() {
  return (await apiFetch<DataEnvelope<BlockedPhone[]>>("/api/order-protection/blocked-phones")).data;
}

export async function blockPhone(phone: string, note?: string) {
  return (
    await apiFetch<DataEnvelope<BlockedPhone[]>>("/api/order-protection/blocked-phones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, note: note || null }),
    })
  ).data;
}

export async function unblockPhone(id: string) {
  return (await apiFetch<DataEnvelope<BlockedPhone[]>>(`/api/order-protection/blocked-phones/${encodeURIComponent(id)}`, { method: "DELETE" })).data;
}
