// packages/data-ops/database/setup.ts
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";

let db: any; // Using any to support both D1 and better-sqlite3 for testing

export function initDatabase(binding: D1Database | any, force = false) {
  if (db && !force) {
    return db;
  }
  // If binding looks like it's from drizzle-orm/d1, use it directly
  if (binding && typeof binding === 'object' && 'select' in binding) {
    db = binding;
  } else {
    // Otherwise assume it's a D1Database binding
    db = drizzle(binding);
  }
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

/**
 * Reset database instance - FOR TESTING ONLY
 * Allows tests to reinitialize with a different database
 */
export function resetDatabase() {
  db = undefined;
}
