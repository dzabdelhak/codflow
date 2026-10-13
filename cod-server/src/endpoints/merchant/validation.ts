import { z } from "@hono/zod-openapi";
import { CHANNEL_STATUSES } from "../../../../cod-shared/channels/lifecycle";

export const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subdomain: z.string().min(1).max(63),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const changeStoreStatusSchema = z.object({
  status: z.enum(CHANNEL_STATUSES),
});

export type ChangeStoreStatusInput = z.infer<typeof changeStoreStatusSchema>;

export const deleteStoreSchema = z.object({
  confirmName: z.string().min(1),
});

export type DeleteStoreInput = z.infer<typeof deleteStoreSchema>;

export const StoreIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});
