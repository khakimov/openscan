/**
 * Integration test setup file
 * Runs for each test file but only initializes Miniflare once
 * Shares D1 database across all integration tests
 */

import { Miniflare } from 'miniflare';
import path from 'node:path';
import { initDatabase, resetDatabase, getDb } from '@repo/data-ops/database/setup';

// Module-level Miniflare instance (shared across all test files)
let mf: Miniflare | null = null;
let initPromise: Promise<void> | null = null;

// Initialize Miniflare only once (first test file that loads this module)
if (!initPromise) {
  initPromise = (async () => {
    // Check if already initialized
    try {
      getDb();
      console.log('📊 Database already initialized - reusing connection');
      return;
    } catch {
      // Not initialized yet, proceed with initialization
    }

    console.log('🚀 Initializing Miniflare for integration tests');

    // Reset any cached database instance
    resetDatabase();

    // Create single Miniflare instance for all tests
    mf = new Miniflare({
      modules: true,
      script: '',
      d1Databases: {
        DB: 'test-sec-db', // preview_database_id from wrangler.jsonc
      },
      d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
    });

    // Get D1 binding and initialize database
    const d1db = await mf.getD1Database('DB');
    initDatabase(d1db);

    console.log('✅ Miniflare initialized - ready for integration tests');

    // Clean up on process exit (not per-test-file)
    process.on('beforeExit', async () => {
      if (mf) {
        console.log('🧹 Disposing Miniflare instance');
        await mf.dispose();
        resetDatabase();
        console.log('✅ Miniflare disposed');
      }
    });
  })();
}

// Ensure initialization completes before tests run
await initPromise;
