/**
 * McpProps — the per-request identity handed to the MCP server, resolved by
 * `./access.ts` from a verified access token, the merchant's consent for the
 * token's channel and the user's current scopes.
 *   • `scopes` — the tools registered for this request (`./registry.ts`)
 *   • `storeId` / `merchantId` — the RLS scope every tool call runs in
 *   • `userId` + `name` + `email` — audit-log attribution
 */
export interface McpProps extends Record<string, unknown> {
  /** Better Auth user UUID. */
  userId: string;
  /** Admin or staff; tools are gated by `scopes` alone. */
  role: "admin" | "staff";
  /** Scopes the token carries, the merchant consented to and the user still holds. Never "*". */
  scopes: string[];
  /** Display name for audit log attribution. May be empty string if user row lacks it. */
  name: string;
  /** User email — useful for log correlation with the existing activity-log shape. */
  email: string;
  /** The channel the merchant authorised; every tool call runs pinned to it. */
  storeId: string;
  merchantId: string;
  clientId: string;
}
