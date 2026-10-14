/** One consent: a user let a client manage one channel. */
export interface McpConnection {
  clientId: string;
  clientName: string | null;
  clientIconUrl: string | null;
  clientHomepageUrl: string | null;
  storeId: string;
  storeName: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
  active: boolean;
  /** Only populated when listing every user (team view). */
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

/** Client-side config derived from identity + the public API URL. */
export interface McpConfig {
  mcpUrl: string;
  currentUserId: string;
  currentUserRole: "admin" | "staff";
}
