import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossSiteRequest } from "./lib/auth/origin-check";

export const onRequest = defineMiddleware((context, next) => {
  if (!context.isPrerendered && isForbiddenCrossSiteRequest(context.request, context.url)) {
    return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
  }
  return next();
});
