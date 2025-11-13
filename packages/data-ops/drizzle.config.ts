// packages/data-ops/drizzle.config.ts
import type { Config } from "drizzle-kit";

const config: Config = {
  out: "./migrations",
  schema: [
    "./src/drizzle/auth-schema.ts",
    "./src/schema/inventory.ts",
    "./src/schema/scanners.ts",
    "./src/schema/orchestration.ts",
    "./src/schema/notifications.ts",
  ],
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CF_ACCOUNT_ID ?? "",
    databaseId: process.env.CF_D1_DATABASE_ID ?? "",
    token: process.env.CF_API_TOKEN ?? "",
  },
};

export default config satisfies Config;
