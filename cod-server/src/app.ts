/**
 * COD Flow API — the Hono app. Served by the Node entry (src/node.ts).
 *
 * Every database-backed route group runs inside a request scope: one
 * connection, one transaction, pinned to the request's store (src/db/scope.ts).
 * The MCP endpoint and its OAuth provider return with ticket 16.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext, Env } from "@/types";
import { corsMiddleware } from "@/middleware/cors";
import { authMiddleware } from "@/middleware/auth";
import { dashboardScope } from "@/middleware/dashboardScope";
import { aventyCatalogue, aventyDelivery, aventyTeam } from "@/middleware/aventyOwned";
import merchantRoutes from "@/endpoints/merchant/routes";
import channelProductsRoutes from "@/endpoints/channel-products/routes";
import landingChannelRoutes from "@/endpoints/landing-channel/routes";
import channelDesignRoutes from "@/endpoints/channel-design/routes";
import channelDomainRoutes, { tlsAskRouter } from "@/endpoints/channel-domains/routes";
import trackingRoutes from "@/endpoints/tracking/routes";
import orderProtectionRoutes from "@/endpoints/order-protection/routes";
import transmissionRoutes from "@/endpoints/transmission/routes";
import mcpManagementRoutes from "@/endpoints/mcp/routes";
import aventyRoutes from "@/endpoints/aventy/routes";
import { mcpRoutes, protectedResourceMetadata } from "@/mcp/route";
import { platformStatus } from "@/platform/status";
import { certificateProbeHost } from "@/platform/tls-probe";
import { storeAuthMiddleware } from "@/middleware/storeAuth";
import { errorHandler } from "@/middleware/error";

// Import routes
import storeRoutes from "@/endpoints/store/routes";
import webhooksRouter from "@/endpoints/webhooks/routes";
import ordersRoutes from "@/endpoints/orders/routes";
import usersRoutes from "@/endpoints/users/routes";
import customersRoutes from "@/endpoints/customers/routes";
import customerGroupsRoutes from "@/endpoints/customer-groups/routes";
import customerTagsRoutes from "@/endpoints/customer-tags/routes";
import driversRoutes from "@/endpoints/drivers/routes";
import wilayasRoutes from "@/endpoints/wilayas/routes";
import deliveryCompaniesRoutes from "@/endpoints/delivery-companies/routes";
import productsRoutes from "@/endpoints/products/routes";
import productGroupsRoutes from "@/endpoints/product-groups/routes";
import landingPagesRoutes from "@/endpoints/landing-pages/routes";
import storePagesRoutes from "@/endpoints/store-pages/routes";
import checkoutFormRoutes from "@/endpoints/checkout-form/routes";
import whatsappWidgetRoutes from "@/endpoints/whatsapp-widget/routes";
import shippingProfilesRoutes from "@/endpoints/shipping-profiles/routes";
import driverPaymentsRoutes from "@/endpoints/driver-payments/routes";
import { uploadRouter, serveRouter } from "@/endpoints/images/routes";
import activityLogsRoutes from "@/endpoints/activity-logs/routes";
import storesRoutes from "@/endpoints/stores/routes";
import reviewsRoutes from "@/endpoints/reviews/routes";
import offersRoutes from "@/endpoints/offers/routes";
import { stockRouter, productStockRouter } from "@/endpoints/stock/routes";
import { registerSpecEndpoint } from "@/openapi/serve";
import { openApiValidationHook } from "@/openapi/validation-hook";
import analyticsRoutes from "@/endpoints/analytics/routes";
import abandonedOrdersRoutes from "@/endpoints/abandoned-orders/routes";
import storeAbandonedRoutes from "@/endpoints/abandoned-orders/store-routes";
import storeOtpRoutes from "@/endpoints/store-otp/store-routes";

import { requestScope, soleStoreId } from "@/db/scope";

// OpenAPIHono extends Hono: existing routes/middleware keep working, and
// routes registered via app.openapi() validate requests and feed the
// generated spec. The default hook keeps framework validation errors in
// the platform error envelope.
const app = new OpenAPIHono<AppContext>({ defaultHook: openApiValidationHook });

// Global middleware
app.use("*", corsMiddleware);
app.onError(errorHandler);

// Image serving and carrier webhooks have no user or hostname yet: they serve
// the deployment's only store until their tickets give them one.
const soleStoreScope = requestScope((c) => soleStoreId(c.env.DATABASE.platform));
app.use("/webhooks/*", soleStoreScope);

// Image serving — no auth required (public, cacheable)
app.route("/images", serveRouter);
app.route("/platform/tls-ask", tlsAskRouter);
app.get("/platform/status", async (c) => {
  const status = await platformStatus(c.env.DATABASE.platform, { certificatesChecked: Boolean(certificateProbeHost(c.env)) });
  return c.json(status, status.ok ? 200 : 503);
});
app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
app.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
app.route("/mcp", mcpRoutes);

// OpenAPI documentation — no auth required (public)
// Must be mounted BEFORE app.use("/api/*", authMiddleware)
registerSpecEndpoint(app);

// Webhook receivers — public, no auth, signature-verified internally
// MUST be mounted BEFORE app.use("/api/*", authMiddleware)
app.route("/webhooks", webhooksRouter);

// Store API — separate auth (must be before /api/* authMiddleware)
app.use("/store/*", storeAuthMiddleware);
app.route("/store", storeRoutes);
app.route("/store", storeAbandonedRoutes);
app.route("/store", storeOtpRoutes);

// Health check (no auth required)
app.get("/", (c) => {
  return c.json({
    service: "COD Flow API",
    version: "1.0.0",
    status: "healthy",
    environment: c.env.ENVIRONMENT
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Protected routes (require authentication)
// Dashboard: the user's merchant, then the store chosen in the header (X-Store-Id).
app.use("/api/*", authMiddleware);
app.use("/api/*", dashboardScope);
app.use("/api/products/*", aventyCatalogue);
app.use("/api/product-groups/*", aventyCatalogue);
app.use("/api/shipping-profiles/*", aventyDelivery);
app.use("/api/users/*", aventyTeam);

// Mount endpoint routes
app.route("/api/images", uploadRouter);
app.route("/api/activity-logs", activityLogsRoutes);
app.route("/api/orders", ordersRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/customers", customersRoutes);
app.route("/api/customer-groups", customerGroupsRoutes);
app.route("/api/customer-tags", customerTagsRoutes);
app.route("/api/drivers", driversRoutes);
app.route("/api/wilayas", wilayasRoutes);
app.route("/api/delivery-companies", deliveryCompaniesRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/product-groups", productGroupsRoutes);
app.route("/api/channel-products", channelProductsRoutes);
app.route("/api/landing-channel", landingChannelRoutes);
app.route("/api/channel-design", channelDesignRoutes);
app.route("/api/channel-domains", channelDomainRoutes);
app.route("/api/tracking", trackingRoutes);
app.route("/api/order-protection", orderProtectionRoutes);
app.route("/api/transmission", transmissionRoutes);
app.route("/api/mcp", mcpManagementRoutes);
app.route("/api/aventy", aventyRoutes);
app.route("/api/landing-pages", landingPagesRoutes);
app.route("/api/store-pages", storePagesRoutes);
app.route("/api/checkout-form", checkoutFormRoutes);
app.route("/api/whatsapp-widget", whatsappWidgetRoutes);
app.route("/api/shipping-profiles", shippingProfilesRoutes);
app.route("/api/driver-payments", driverPaymentsRoutes);
app.route("/api/stores", storesRoutes);
app.route("/api/merchant", merchantRoutes);
app.route("/api/reviews", reviewsRoutes);
app.route("/api/offers", offersRoutes);
app.route("/api/stock", stockRouter);
app.route("/api/products", productStockRouter);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/abandoned-orders", abandonedOrdersRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
