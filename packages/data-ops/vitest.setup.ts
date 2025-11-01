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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, resetDatabase } from './src/database/setup';
import { afterAll } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 Initializing in-memory SQLite for data-ops tests');

// Reset any cached database instance
resetDatabase();

// Create in-memory SQLite database
const sqlite = new Database(':memory:');

// Create Drizzle instance
const db = drizzle(sqlite);

// Run migrations to set up schema (optional - some tests don't need it)
try {
  const migrationsFolder = path.join(__dirname, 'migrations');
  migrate(db, { migrationsFolder });
  console.log('✅ Migrations applied to in-memory database');
} catch (error) {
  console.warn('⚠️  Migrations failed (some tests may not need them):', error instanceof Error ? error.message : String(error));
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
