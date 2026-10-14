import { z } from "@hono/zod-openapi";
import { UNAVAILABLE_RULES } from "../../../../cod-shared/channels/types";

export const mainProductSchema = z.object({
  productId: z.string().min(1).openapi({ description: "The catalogue product that becomes the landing's main product" }),
});

export type MainProductInput = z.infer<typeof mainProductSchema>;

export const ruleSchema = z.object({
  unavailableRule: z.enum(UNAVAILABLE_RULES),
});

export type RuleInput = z.infer<typeof ruleSchema>;
