import type { APIRoute } from "astro";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createAuth } from "@/lib/auth/server";

export const prerender = false;

export const GET: APIRoute = ({ request }) => oauthProviderAuthServerMetadata(createAuth())(request);
