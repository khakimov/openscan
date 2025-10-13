// packages/data-ops/config/auth.ts
import Database from "better-sqlite3";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createBetterAuth } from "../src/auth/setup";

export const auth = createBetterAuth({
  database: drizzleAdapter(new Database("./config/d1.sqlite"), {
    provider: "sqlite",
  }),
});
