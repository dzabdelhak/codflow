import { apiFetch } from "@/lib/api";
import type { DesignDocument } from "../../../../cod-shared/channels/design";
import type { TemplateManifest } from "../../../../cod-shared/channels/manifests";

interface DataEnvelope<T> {
  success: boolean;
  data: T;
}

export interface DesignState {
  templateId: string;
  manifest: TemplateManifest;
  current: DesignDocument;
  draft: { document: DesignDocument; baseVersion: number | null; updatedAt: string; updatedBy: string | null } | null;
  published: { version: number; document: DesignDocument; publishedAt: string; publishedBy: string | null } | null;
  versions: Array<{ version: number; publishedAt: string; publishedBy: string | null }>;
}

const json = (init: RequestInit): RequestInit => ({ ...init, headers: { "Content-Type": "application/json" } });

export async function getDesign(): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design")).data;
}

export async function saveDesignDraft(document: DesignDocument): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design/draft", json({ method: "PUT", body: JSON.stringify({ document }) }))).data;
}

export async function discardDesignDraft(): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design/draft", { method: "DELETE" })).data;
}

export async function publishDesign(): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design/publish", { method: "POST" })).data;
}

export async function changeChannelTemplate(templateId: string): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design/template", json({ method: "PUT", body: JSON.stringify({ templateId }) }))).data;
}

export async function restoreDesignVersion(version: number): Promise<DesignState> {
  return (await apiFetch<DataEnvelope<DesignState>>("/api/channel-design/restore", json({ method: "POST", body: JSON.stringify({ version }) }))).data;
}

export async function designPreviewLink(): Promise<{ hostname: string; token: string; expiresAt: string }> {
  return (await apiFetch<DataEnvelope<{ hostname: string; token: string; expiresAt: string }>>("/api/channel-design/preview", { method: "POST" })).data;
}
