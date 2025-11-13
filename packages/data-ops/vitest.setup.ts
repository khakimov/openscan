/**
 * Vitest setup file for data-ops package
 *
 * Creates an in-memory SQLite database for fast unit tests.
 * This is simpler than Miniflare and perfect for testing:
 * - Zod schema validation
 * - Type-level assertions
 * - Query logic
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, resetDatabase } from './src/database/setup';
import { afterAll } from 'vitest';
import * as schema from './src/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Initializing in-memory SQLite for data-ops tests');

// Reset any cached database instance
resetDatabase();

// Create in-memory SQLite database
const sqlite = new Database(':memory:');

// Create Drizzle instance with schema
const db = drizzle(sqlite, { schema });

// For MVP tests: Create minimal schema needed for tests
// Skip full migration chain to avoid data migration issues
try {
  // Enable foreign keys
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Create only the base schema needed for notification tests
  // This is faster and more reliable than running full migration chain
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "organization" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "slug" text UNIQUE,
      "logo" text,
      "metadata" text,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "auth_user" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text NOT NULL,
      "name" text NOT NULL,
      "email_verified" integer DEFAULT false NOT NULL,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      "updated_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "devices" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "host" text NOT NULL,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "scan_runs" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "notifications" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "user_id" text,
      "device_id" text,
      "scan_run_id" text,
      "type" text NOT NULL,
      "severity" text NOT NULL,
      "module" text NOT NULL,
      "title" text NOT NULL,
      "message" text,
      "data" text,
      "fingerprint" text NOT NULL,
      "suppress_until" integer NOT NULL,
      "message_hash" text NOT NULL,
      "is_active" integer DEFAULT 1 NOT NULL,
      "read_at" integer,
      "email_sent" integer DEFAULT 0 NOT NULL,
      "email_sent_at" integer,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      "updated_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
      FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE,
      FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE,
      FOREIGN KEY ("scan_run_id") REFERENCES "scan_runs"("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "organization_notification_settings" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL UNIQUE,
      "email_allowed_severities" text DEFAULT '["CRITICAL","HIGH"]' NOT NULL,
      "created_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      "updated_at" integer DEFAULT (unixepoch('now') * 1000) NOT NULL,
      FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "notifications_org_idx" ON "notifications" ("organization_id");
    CREATE INDEX IF NOT EXISTS "notifications_dedup_idx" ON "notifications" ("organization_id", "fingerprint", "suppress_until");
    CREATE INDEX IF NOT EXISTS "org_notification_settings_org_idx" ON "organization_notification_settings" ("organization_id");

    -- Partial unique index: Allows multiple inactive rows, only ONE active row per (org_id, fingerprint)
    -- Matches production schema (migration 0010_composite_fingerprint_index.sql)
    CREATE UNIQUE INDEX IF NOT EXISTS "notifications_org_fingerprint_active_uq"
    ON "notifications" ("organization_id", "fingerprint")
    WHERE "is_active" = 1;
  `);

  console.log('✅ Minimal test schema created (skipping full migrations for MVP)');
} catch (error) {
  console.warn('⚠️  Schema creation failed:', error instanceof Error ? error.message : String(error));
}

// Initialize data-ops with the in-memory database
// @ts-expect-error - D1Database type mismatch, but compatible at runtime
initDatabase(db, true);

console.log('✅ In-memory database ready for tests');

// Clean up after all tests
afterAll(() => {
  console.log('🧹 Closing in-memory database');
  sqlite.close();
  resetDatabase();
  console.log('✅ Database closed');
});
