import { fileURLToPath } from "node:url";
import { defineConfig, envField } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

const orderDetailFallback = {
  name: "order-detail-static-fallback",
  // Vite resolves plugin hooks (including configureServer) in enforce-sorted
  // order: pre plugins install their dev middleware before the adapter's
  // request handling.
  enforce: "en",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = request.url?.split("?", 1)[0] ?? "";
       const isOrderDetail = /^\/orders\/[^/]+\/?$/.test(pathname) && pathname !== "/orders/new" && pathname !== "/orders/abandoned";
       const isCustomerDetail = /^\/customers\/[^/]+(?:\/edit)?\/?$/.test(pathname) && pathname !== "/customers/new";
       const isCustomerGroupDetail = /^\/customer-groups\/[^/]+(?:\/edit)?\/?$/.test(pathname) && pathname !== "/customer-groups/new";
       const isCustomerTagDetail = /^\/customer-tags\/[^/]+(?:\/edit)?\/?$/.test(pathname) && pathname !== "/customer-tags/new";
       const isProductDetail = /^\/products\/[^/]+(?:\/edit)?\/?$/.test(pathname) && pathname !== "/products/new" && pathname !== "/products/stock";
       const isProductGroupEdit = /^\/product-groups\/[^/]+\/edit\/?$/.test(pathname);
       const isOfferEdit = /^\/offers\/[^/]+\/?$/.test(pathname) && pathname !== "/offers/new";
       const isDriverRoute = /^\/delivery\/drivers\/[^/]+(?:\/(edit|compensations))?\/?$/.test(pathname) && pathname !== "/delivery/drivers/new";
       const isDeliveryCompanyRoute = /^\/delivery\/companies\/[^/]+(?:\/(credentials|stop-desks))?\/?$/.test(pathname);
       const isShippingProfileRoute = /^\/delivery\/shipping-profiles\/[^/]+(?:\/edit)?\/?$/.test(pathname) && pathname !== "/delivery/shipping-profiles/new";
       const isTeamMemberRoute = /^\/team\/[^/]+\/?$/.test(pathname);
       const isLandingPageStudio = /^\/landing-pages\/[^/]+\/studio\/?$/.test(pathname);
       const isDetail = isOrderDetail || isCustomerDetail || isCustomerGroupDetail || isCustomerTagDetail || isProductDetail || isProductGroupEdit || isOfferEdit || isDriverRoute || isDeliveryCompanyRoute || isShippingProfileRoute || isTeamMemberRoute || isLandingPageStudio;
       // SPA fallback in dev, as src/pages/[...spa].ts does in production:
       // serve the client index for detail loads. Mutating-and-forwarding
       // cannot work here: the adapter stack restores the request URL after
       // the middleware chain, so we serve the proven root page directly.
       if (!isDetail || request.method !== "GET") return next();
       const base = server.resolvedUrls?.local?.[0];
       if (!base) return next();
       try {
         const upstream = await fetch(base, { headers: { accept: "text/html" } });
         response.statusCode = upstream.status;
         response.setHeader("content-type", upstream.headers.get("content-type") ?? "text/html; charset=utf-8");
         response.end(Buffer.from(await upstream.arrayBuffer()));
       } catch {
         next();
       }
    });
  },
};

// Static-first: every page prerenders at build time except routes that opt out
// with `export const prerender = false` (/api/auth/*, the MCP authorization
// pages, the reset-password link, and the SPA fallback).
export default defineConfig({
  output: "static",
  // No Astro.session usage (auth is better-auth + Redis).
  session: false,
  security: { checkOrigin: false },
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({ context: "client", access: "public" }),
    },
  },
  integrations: [react()],
  adapter: node({ mode: "standalone" }),
  vite: {
    // Vite's SPA fallback serves the client index for unmatched HTML requests
    // during astro dev only; production uses src/pages/[...spa].ts.
    appType: "spa",
    plugins: [orderDetailFallback, tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
