import { z } from "@hono/zod-openapi";
import { CHANNEL_STATUSES } from "../../../../cod-shared/channels/lifecycle";
import { AVAILABLE_CHANNEL_TYPES, type ChannelType } from "../../../../cod-shared/channels/types";

export const createStoreSchema = z.object({
  type: z.enum(AVAILABLE_CHANNEL_TYPES as [ChannelType, ...ChannelType[]]).default("store"),
  name: z.string().trim().min(1).max(80),
  subdomain: z.string().min(1).max(63),
  creationKey: z.string().min(8).max(100).optional().openapi({
    description: "Client-generated key, the same on every retry of this creation: a second request with it returns the store already created.",
    example: "01HZX3M4Q6V8T2K9N5C7B1D0FE",
  }),
  productIds: z.array(z.string().min(1)).max(500).optional().openapi({ description: "Catalogue products the store shows, in display order" }),
  deliveryModes: z
    .object({ home: z.boolean(), stopDesk: z.boolean() })
    .refine((m) => m.home || m.stopDesk, { message: "Offer at least one delivery mode" })
    .optional(),
  defaultShippingProfileId: z.string().min(1).nullable().optional(),
  templateId: z.string().min(1).optional().openapi({ example: "theme01" }),
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
