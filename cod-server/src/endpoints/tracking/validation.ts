import { z } from "@hono/zod-openapi";

export const testEventSchema = z.object({
  provider: z.enum(["meta", "tiktok", "snap", "ga4"]).openapi({
    description: "Meta and TikTok send to their test event stream (the test event code must be set); Snap and GA4 use their validation endpoints, which record nothing.",
  }),
});

export type TestEventInput = z.infer<typeof testEventSchema>;
