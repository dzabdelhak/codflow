import { z } from "@hono/zod-openapi";

export const draftSchema = z.object({
  document: z.unknown().openapi({
    description: "The whole section-state document: `{ brand, sections[] }`, checked against the channel's template manifest.",
  }),
});

export type DraftInput = z.infer<typeof draftSchema>;

export const restoreSchema = z.object({
  version: z.number().int().min(1),
});

export type RestoreInput = z.infer<typeof restoreSchema>;
