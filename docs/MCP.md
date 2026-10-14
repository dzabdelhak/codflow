# MCP server

AI agents (Claude, ChatGPT, any MCP client) manage one channel through
`POST <api>/mcp`. A connection is one user, one client and one channel.

## Authorization

The dashboard is the OAuth authorization server
(`@better-auth/oauth-provider` on better-auth, `cod-client-astro/src/lib/auth/server.ts`);
cod-server is the resource server.

1. The agent calls `/mcp` without a token and gets `401` with
   `WWW-Authenticate: Bearer resource_metadata="<api>/.well-known/oauth-protected-resource/mcp"`.
2. That document names the resource (`<api>/mcp`), the authorization server
   (`<app>/api/auth`) and the scopes. The server's metadata is at
   `<app>/.well-known/oauth-authorization-server/api/auth`.
3. The agent registers itself (`POST <app>/api/auth/oauth2/register`, dynamic
   client registration, no authentication) and opens
   `<app>/api/auth/oauth2/authorize` with PKCE and `resource=<api>/mcp`.
4. The merchant signs in, then picks the channel at `/mcp/channel`. The
   choice is kept in Redis for this authorization only
   (`mcp-channel:<sessionId>:<client_id>:<code_challenge>`, 10 minutes): the
   auth route reads the authorization from the request (`authorizationKeyOf`),
   so a second authorization, in another tab or later, asks again. It must be
   a non-archived store of the user's merchant.
5. `/mcp/consent` shows the agent, the channel and the permissions it asked
   for, limited to those the user holds. What the merchant allows is stored
   as a consent whose `reference_id` is the channel.
6. The token endpoint issues a JWT access token (1 hour, signed by the
   dashboard's JWKS) with `aud` = `<api>/mcp`, `azp` = the client and
   `store_id` = the channel, and a refresh token (30 days) when
   `offline_access` was granted.

## Every request

`cod-server/src/mcp/route.ts` and `access.ts`:

- The token's signature is checked against the dashboard's JWKS
  (`BETTER_AUTH_JWKS_URL`). It must carry `aud` = `${PUBLIC_API_URL}/mcp`,
  `iss` = `${BETTER_AUTH_URL}/api/auth`, `exp`, `azp` and `store_id`.
- The user must still be active and belong to the merchant that owns the
  channel, and the channel must not be archived (`403` otherwise).
- A consent for (user, client, channel) must exist, and the token must have
  been issued after it (`iat`), otherwise `401`. Revoking a connection deletes
  it, so the next request is refused, and its old tokens stay refused when the
  agent is authorised again.
- Granted scopes = the token's ∩ the consent's ∩ the user's current scopes.
  An admin gets only what the connection was granted.
- The request runs in `withStore` on the app pool, pinned to the channel and
  its merchant: Row-Level Security confines every tool to that channel.

A dashboard session JWT is refused at `/mcp`. An MCP access token is
refused as a dashboard session (`verifySessionJwt`).

Tool calls are rate-limited per user and client: 200 per minute, counted in
Redis (`REDIS_URL`). Client hints such as `openai/subject` only reach the
audit row. Without Redis, or while it is unreachable, the limit is off and the
server still serves. Each call is written to the channel's activity log.

## Connections page

The dashboard's MCP page (`/api/mcp/*`) lists one row per (user, client,
channel), with the channel's name and when the connection was last used
(Redis, 60 days). Revoking deletes the consent and revokes its access and
refresh tokens. An admin may revoke a teammate's connection or remove a
client from the whole team. These actions only touch the merchant's own
users and channels: a client other merchants use is removed only once no
one uses it.

## Configuration

| Where | Variable | |
|---|---|---|
| cod-server | `PUBLIC_API_URL` | the API's public origin — the token audience is `<it>/mcp` |
| cod-server | `BETTER_AUTH_URL` | the dashboard's public origin — the issuer is `<it>/api/auth` |
| cod-server | `BETTER_AUTH_JWKS_URL` | the JWKS as reachable from the API (in Docker `http://dashboard:4321/api/auth/jwks`) |
| cod-server | `REDIS_URL` | rate limit and last-used times (optional) |
| dashboard | `PUBLIC_API_URL` | the resource it issues tokens for is `<it>/mcp` |
