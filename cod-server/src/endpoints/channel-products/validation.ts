import { z } from "@hono/zod-openapi";

export const addSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
});

export const updateSchema = z
  .object({
    published: z.boolean().optional(),
    featured: z.boolean().optional(),
    shippingProfileId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });

export const orderSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(1000),
});

export const productIdParams = z.object({
  productId: z.string().openapi({ param: { name: "productId", in: "path" } }),
});

export type AddInput = z.infer<typeof addSchema>;
export type UpdateInput = z.infer<typeof updateSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
