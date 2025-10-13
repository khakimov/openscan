// packages/data-ops/database/setup.ts
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

let db: ReturnType<typeof drizzle>;

export function initDatabase(binding: D1Database) {
  if (db) {
    return db;
  }
  db = drizzle(binding);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
