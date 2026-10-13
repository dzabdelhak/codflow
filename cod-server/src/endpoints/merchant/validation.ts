import { z } from "@hono/zod-openapi";

export const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subdomain: z.string().min(1).max(63),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
