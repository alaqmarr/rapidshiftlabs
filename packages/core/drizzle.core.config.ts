import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/infrastructure/db/schema/core.ts",
  out: "./drizzle/core",
  dialect: "sqlite",
  dbCredentials: {
    url: "../../data/core.db",
  },
});
