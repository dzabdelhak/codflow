import { apiFetch } from "@/lib/api";
import type {
  AventyKeyStatus,
  AventySyncRow,
  ConversionEventRow,
  EmailConfig,
  EmailConnectionCheck,
  OtpConfig,
  OtpConnectionCheck,
  PixelConfig,
  SaveEmailConfigData,
  SaveOtpConfigData,
  SavePixelConfigData,
  SaveTurnstileConfigData,
  ServerTrackingProvider,
  StoreConfig,
  TrackingTestResult,
  TurnstileConfig,
  UpdateStoreData,
} from "./types";

interface DataEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

function json(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  };
}

export async function getMyStore() {
  return (await apiFetch<DataEnvelope<StoreConfig>>("/api/stores/me")).data;
}

export async function updateMyStore(data: UpdateStoreData) {
  return (await apiFetch<DataEnvelope<StoreConfig>>("/api/stores/me", json({ method: "PATCH", body: JSON.stringify(data) }))).data;
}

export async function getPixelConfig() {
  return (await apiFetch<DataEnvelope<PixelConfig | null>>("/api/stores/pixel-config")).data;
}

export async function savePixelConfig(data: SavePixelConfigData) {
  return (await apiFetch<DataEnvelope<PixelConfig>>("/api/stores/pixel-config", json({ method: "POST", body: JSON.stringify(data) }))).data;
}

export async function sendTrackingTestEvent(provider: ServerTrackingProvider) {
  return (await apiFetch<DataEnvelope<TrackingTestResult>>("/api/tracking/test", json({ method: "POST", body: JSON.stringify({ provider }) }))).data;
}

export async function getConversionEvents(limit = 30) {
  return (await apiFetch<DataEnvelope<ConversionEventRow[]>>(`/api/tracking/events?limit=${limit}`)).data;
}

export async function getOtpConfig() {
  return (await apiFetch<DataEnvelope<OtpConfig | null>>("/api/stores/otp-config")).data;
}

export async function saveOtpConfig(data: SaveOtpConfigData) {
  return (await apiFetch<DataEnvelope<OtpConfig>>("/api/stores/otp-config", json({ method: "POST", body: JSON.stringify(data) }))).data;
}

export async function testOtpConnection(apiKey?: string) {
  return (await apiFetch<DataEnvelope<OtpConnectionCheck>>("/api/stores/otp-config/test", json({ method: "POST", body: JSON.stringify(apiKey ? { apiKey } : {}) }))).data;
}

export async function getTurnstileConfig() {
  return (await apiFetch<DataEnvelope<TurnstileConfig | null>>("/api/stores/turnstile-config")).data;
}

export async function saveTurnstileConfig(data: SaveTurnstileConfigData) {
  return (await apiFetch<DataEnvelope<TurnstileConfig>>("/api/stores/turnstile-config", json({ method: "POST", body: JSON.stringify(data) }))).data;
}

export async function getEmailConfig() {
  return (await apiFetch<DataEnvelope<EmailConfig | null>>("/api/stores/email-config")).data;
}

export async function saveEmailConfig(data: SaveEmailConfigData) {
  return (await apiFetch<DataEnvelope<EmailConfig>>("/api/stores/email-config", json({ method: "POST", body: JSON.stringify(data) }))).data;
}

export async function testEmailConnection(apiKey?: string) {
  return (await apiFetch<DataEnvelope<EmailConnectionCheck>>("/api/stores/email-config/test", json({ method: "POST", body: JSON.stringify(apiKey ? { apiKey } : {}) }))).data;
}

export async function getAventyKey() {
  return (await apiFetch<{ success: boolean; data: AventyKeyStatus }>("/api/aventy/key")).data;
}

export async function saveAventyKey(key: string) {
  return (await apiFetch<{ success: boolean; data: AventyKeyStatus }>("/api/aventy/key", json({ method: "PUT", body: JSON.stringify({ key }) }))).data;
}

export async function removeAventyKey() {
  return (await apiFetch<{ success: boolean; data: AventyKeyStatus }>("/api/aventy/key", { method: "DELETE" })).data;
}

export async function getAventySync() {
  return (await apiFetch<{ success: boolean; data: AventySyncRow[] }>("/api/aventy/sync")).data;
}
