import { apiFetch } from "@/lib/api";

export type OutboundOutcome = "accepted" | "duplicate" | "review" | "rejected" | "retry" | "unauthorized" | "unknown" | "error";

export type TransmissionAlerts = { stale: number; rejected: number; aventyKey: "missing" | "revoked" | null };

export interface OutboundEntry {
  sendId: string;
  orderId: string;
  orderNumber: string;
  status: "pending" | "sent" | "rejected";
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  lastOutcome: OutboundOutcome | null;
  outcomeDetail: { reasons?: string[]; fields?: string[] } | null;
  lastError: string | null;
  sentAt: string | null;
  remoteId: string | null;
}

export interface Transmission {
  destination: string;
  connection: { state: "connected" | "failing" | "idle"; lastAttemptAt: string | null; lastOutcome: OutboundOutcome | null };
  lastSuccessAt: string | null;
  counts: { waiting: number; sent: number; rejected: number; stale: number };
  oldestWaitingAt: string | null;
  waiting: OutboundEntry[];
  rejected: OutboundEntry[];
  recentErrors: OutboundEntry[];
}

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

export async function getTransmission() {
  return (await apiFetch<DataEnvelope<Transmission>>("/api/transmission")).data;
}

export async function getTransmissionAlerts() {
  return (await apiFetch<DataEnvelope<TransmissionAlerts>>("/api/transmission/alerts")).data;
}

export async function resendOutbound(sendId: string) {
  return (await apiFetch<DataEnvelope<Transmission>>(`/api/transmission/${encodeURIComponent(sendId)}/resend`, { method: "POST" })).data;
}
