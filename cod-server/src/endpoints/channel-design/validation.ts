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

export const templateSchema = z.object({
  templateId: z.string().min(1).max(40).openapi({ description: "A ready-made template of the channel's type", example: "electro" }),
});

export type TemplateInput = z.infer<typeof templateSchema>;
