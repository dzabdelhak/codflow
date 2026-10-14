import type { APIRoute } from "astro";
import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { createAuth } from "@/lib/auth/server";

export const prerender = false;

export const GET: APIRoute = ({ request }) => oauthProviderOpenIdConfigMetadata(createAuth())(request);
