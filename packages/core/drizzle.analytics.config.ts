import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/infrastructure/db/schema/analytics.ts",
  out: "./drizzle/analytics",
  dialect: "sqlite",
  dbCredentials: {
    url: "../../data/analytics.db",
  },
});
