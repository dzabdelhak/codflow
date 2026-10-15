import { apiFetch } from "@/lib/api";
import type { MessengerWidgetConfig } from "../../../../cod-shared/messenger-widget/config";

export type { MessengerWidgetConfig };

interface State {
  config: MessengerWidgetConfig;
}

export async function getMessengerWidget(): Promise<MessengerWidgetConfig> {
  return (await apiFetch<{ data: State }>("/api/messenger-widget")).data.config;
}

export async function saveMessengerWidget(config: MessengerWidgetConfig): Promise<MessengerWidgetConfig> {
  return (
    await apiFetch<{ data: State }>("/api/messenger-widget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
  ).data.config;
}
