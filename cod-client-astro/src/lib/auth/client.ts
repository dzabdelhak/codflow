import { createAuthClient } from "better-auth/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

/** Same-origin better-auth client — the single shared instance for islands. */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export function oauthRedirect(data: unknown): string | null {
  const answer = data as { redirect?: boolean; url?: string } | null;
  return answer?.redirect && typeof answer.url === "string" ? answer.url : null;
}
