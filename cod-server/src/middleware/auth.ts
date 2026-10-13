/**
 * Authentication Middleware
 *
 * Validates API keys and loads user scopes for RBAC.
 * Supports both Bearer JWT tokens (from dashboard) and X-API-Key (programmatic access).
 */

import { Context, Next } from "hono";
import type { AppContext } from "@/types";
import { verifySessionJwt } from "@/lib/session-auth";
import { getDb } from "@/db";
import { users, userScopes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ERROR_CODES } from "../../../cod-shared/errors/codes";

export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header("Authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const apiKey = c.req.header("X-API-Key");

  // Identity is platform data: the user (and so their merchant) is known
  // before any store is.
  const db = getDb(c.env.DATABASE.platform);
  let user: typeof users.$inferSelect | undefined;

  if (bearerMatch) {
    try {
      const payload = await verifySessionJwt(bearerMatch[1], c.env);
      user = await db.select().from(users).where(eq(users.id, payload.sub)).then((rows) => rows[0]);
    } catch (err) {
      console.error("[auth] JWT verification failed:", err);
      return c.json({ 
        error: "Invalid token", 
        code: ERROR_CODES.AUTHENTICATION_FAILED,
        category: "AUTHENTICATION"
      }, 401);
    }
  } else if (apiKey) {
    user = await db.select().from(users).where(eq(users.apiKey, apiKey)).then((rows) => rows[0]);
  } else {
    return c.json({ 
      error: "Missing authorization", 
      code: ERROR_CODES.MISSING_API_KEY,
      category: "AUTHENTICATION"
    }, 401);
  }

  if (!user) {
    return c.json({ 
      error: "User not found", 
      code: ERROR_CODES.AUTHENTICATION_FAILED,
      category: "AUTHENTICATION"
    }, 401);
  }

  if (user.status !== "active") {
    return c.json({ 
      error: "User account is inactive",
      code: ERROR_CODES.USER_INACTIVE,
      category: "AUTHENTICATION"
    }, 403);
  }

  const scopes = user.role === "admin"
    ? ["*"]
    : (await db.select({ scope: userScopes.scope }).from(userScopes).where(eq(userScopes.userId, user.id))).map((r) => r.scope);

  c.set("user", { ...user, scopes });
  await next();
}
