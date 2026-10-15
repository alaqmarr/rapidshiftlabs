import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/infrastructure/db/schema/metrics.ts",
  out: "./drizzle/metrics",
  dialect: "sqlite",
  dbCredentials: {
    url: "../../data/metrics.db",
  },
});
