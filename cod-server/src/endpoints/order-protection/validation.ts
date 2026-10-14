import { z } from "@hono/zod-openapi";

export const blockPhoneSchema = z.object({
  phone: z.string().min(1).max(30).openapi({ example: "0550123456" }),
  note: z.string().trim().max(300).nullable().optional(),
});

export type BlockPhoneInput = z.infer<typeof blockPhoneSchema>;

export const blockedPhoneParams = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" } }),
});

export const attemptsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
