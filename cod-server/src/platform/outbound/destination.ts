export interface OutboundEntry {
  sendId: string;
  storeId: string;
  payload: unknown;
}

export type DestinationAnswer =
  | { kind: "accepted"; remoteId: string }
  | { kind: "duplicate"; remoteId: string }
  | { kind: "review"; remoteId: string; reasons: string[] }
  | { kind: "rejected"; fields: string[]; message: string }
  | { kind: "retry"; reason: string }
  | { kind: "unauthorized"; reason: string }
  | { kind: "unknown"; detail: string };

export interface OrderDestination {
  name: string;
  send(entry: OutboundEntry): Promise<DestinationAnswer>;
}

export function testDestination({ failureRate = 0, random = Math.random }: { failureRate?: number; random?: () => number } = {}): OrderDestination {
  return {
    name: "test",
    async send(entry) {
      if (failureRate > 0 && random() < failureRate) return { kind: "retry", reason: "test destination unavailable" };
      return { kind: "accepted", remoteId: `TEST-${entry.sendId}` };
    },
  };
}

export const DESTINATIONS = ["test", "aventy"] as const;
export type DestinationName = (typeof DESTINATIONS)[number];

export function destinationName(env: { ORDER_DESTINATION?: string }): DestinationName {
  const name = env.ORDER_DESTINATION ?? "test";
  if (!(DESTINATIONS as readonly string[]).includes(name)) throw new Error(`Unknown ORDER_DESTINATION "${name}"`);
  return name as DestinationName;
}

export function destinationFromEnv(
  env: { ORDER_DESTINATION?: string; OUTBOUND_TEST_FAILURE_RATE?: string },
  aventy?: () => OrderDestination,
): OrderDestination {
  if (destinationName(env) === "aventy") {
    if (!aventy) throw new Error("ORDER_DESTINATION=aventy needs the Aventy client and AVENTY_KEY_ENCRYPTION_KEY");
    return aventy();
  }
  const failureRate = Number(env.OUTBOUND_TEST_FAILURE_RATE ?? 0);
  return testDestination({ failureRate: Number.isFinite(failureRate) ? Math.min(Math.max(failureRate, 0), 1) : 0 });
}

export function recognised(answer: unknown): DestinationAnswer {
  const a = answer as Partial<DestinationAnswer> & Record<string, unknown>;
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const list = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  switch (a?.kind) {
    case "accepted":
    case "duplicate":
      if (text(a.remoteId)) return a as DestinationAnswer;
      break;
    case "review":
      if (text(a.remoteId)) return { kind: "review", remoteId: a.remoteId as string, reasons: list(a.reasons) ? (a.reasons as string[]) : [] };
      break;
    case "rejected":
      if (list(a.fields)) return { kind: "rejected", fields: a.fields as string[], message: text(a.message) ? (a.message as string) : "rejected" };
      break;
    case "retry":
      return { kind: "retry", reason: text(a.reason) ? (a.reason as string) : "retry later" };
    case "unauthorized":
      return { kind: "unauthorized", reason: text(a.reason) ? (a.reason as string) : "the channel's Aventy key is not accepted" };
    case "unknown":
      return a as DestinationAnswer;
  }
  return { kind: "unknown", detail: "unrecognised answer" };
}
