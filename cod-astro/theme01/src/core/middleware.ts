// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ║  Handles the POST/Redirect/GET pattern for Astro Actions.            ║
// ║  Changing this file will break form submission for all pages.        ║
// ╚══════════════════════════════════════════════════════════════════════╝
import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { getActionContext } from "astro:actions";
import { withRequestHost } from "./api/request-host";
import { loadStoreConfig } from "./api/client";
import { CHANNEL_CACHE_PATH, channelTag, shouldPurge } from "./channel-cache";
import { primaryRedirect } from "./primary-host";

/**
 * POST/Redirect/GET pattern for Astro Actions (Astro 5 docs pattern).
 *
 * On ERROR  → store result cookie + 303 redirect back to the form page
 *             → page re-renders, getActionResult() returns the error, field
 *               errors are displayed to the user.
 *
 * On SUCCESS → store result cookie + call next()
 *             → next() renders the originating page from the same POST request
 *             → getActionResult() returns the success data, the page issues
 *               Astro.redirect('/thank-you?...') which the browser follows.
 *
 * IMPORTANT: on success we must call next(), NOT context.redirect(). Using
 * context.redirect() drops the setActionResult cookie from the response, so
 * getActionResult() sees undefined on the next page and the thank-you redirect
 * never fires.
 */
export const onRequest = defineMiddleware((context, next) =>
  // Every API call made while rendering this request names this channel.
  withRequestHost(
    context.request.headers.get("host") ?? context.url.host,
    () => handle(context, next),
    context.url.searchParams.get("preview"),
  ),
);

async function handle(context: APIContext, next: MiddlewareNext) {
  if (context.url.pathname === CHANNEL_CACHE_PATH) return next();

  const tag = channelTag(context.request.headers.get("host") ?? context.url.host);
  const { status, data } = await loadStoreConfig();
  if (shouldPurge(tag, status !== 404 && status !== 503)) await context.cache.invalidate({ tags: [tag] }).catch(() => {});
  if (status === 404) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (status === 503) {
    context.locals.channelUnavailable = true;
    return next("/unavailable");
  }
  const preview = context.url.searchParams.has("preview");
  if (!preview && (context.request.method === "GET" || context.request.method === "HEAD")) {
    const target = primaryRedirect(
      context.url,
      context.request.headers.get("host") ?? context.url.host,
      context.request.headers.get("x-forwarded-proto"),
      data?.primaryHostname,
    );
    if (target) return context.redirect(target, 301);
  }
  if (preview) context.cache.set(false);
  else context.cache.set({ tags: [tag] });

  const { action, setActionResult, serializeActionResult } = getActionContext(context);

  if (action?.calledFrom === "form") {
    const result = await action.handler();
    setActionResult(action.name, serializeActionResult(result));

    if (result.error) {
      // Redirect back to the form page so getActionResult() can surface field errors
      const referer = context.request.headers.get("Referer");
      return context.redirect(referer ?? context.url.pathname, 303);
    }

    // Success: let next() render the page; the page will redirect to /thank-you
  }

  return next();
}
