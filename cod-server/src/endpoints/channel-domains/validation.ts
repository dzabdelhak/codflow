import { z } from "@hono/zod-openapi";

export const addDomainSchema = z.object({
  hostname: z.string().min(1).max(300).openapi({ example: "boutique-nour.dz" }),
});

export type AddDomainInput = z.infer<typeof addDomainSchema>;

export const hostnameParams = z.object({
  hostname: z.string().min(1).openapi({ param: { name: "hostname", in: "path" }, example: "boutique-nour.dz" }),
});
