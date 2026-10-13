import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../cod-shared/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://codflow:codflow@localhost:5432/codflow" },
});
