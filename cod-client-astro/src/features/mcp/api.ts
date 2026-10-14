import { apiFetch } from "@/lib/api";
import type { McpConnection } from "./types";

interface ListEnvelope<T> {
  success: boolean;
  data: T[];
  count?: number;
}

interface DataEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function listMyMcpConnections() {
  return (await apiFetch<ListEnvelope<McpConnection>>("/api/mcp/me")).data;
}

export async function listTeamMcpConnections() {
  return (await apiFetch<ListEnvelope<McpConnection>>("/api/mcp/team")).data;
}

export function revokeMyMcpConnection(clientId: string, storeId: string) {
  return apiFetch<DataEnvelope<{ clientId: string; userId: string }>>(`/api/mcp/connections/${encodeURIComponent(clientId)}?storeId=${encodeURIComponent(storeId)}`, { method: "DELETE" });
}

export function revokeUserMcpConnection(clientId: string, userId: string, storeId: string) {
  return apiFetch<DataEnvelope<{ clientId: string; userId: string }>>(`/api/mcp/connections/${encodeURIComponent(clientId)}/users/${encodeURIComponent(userId)}?storeId=${encodeURIComponent(storeId)}`, { method: "DELETE" });
}
