/**
 * Internal API Route: Universal Postback Handler
 *
 * Receives postback callbacks from restate-worker for all workflow types.
 * This endpoint is called by the worker (not by end users).
 *
 * Supported postback types:
 * - PORT_SCAN: Port scan results with open ports and services
 * - DISCOVERY: Discovery results with found devices/subdomains
 *
 * Architecture: apps/restate-worker/CLAUDE.md
 * Data Model: docs/architecture/backend/data-model.md
 * Universal Postback: apps/user-application/src/server/postback/README.md (TODO)
 *
 * Authentication: WORKER_API_KEY (not user session)
 */

import { createFileRoute } from '@tanstack/react-router';
import { initDatabase } from '@repo/data-ops/database/setup';
import { handleUniversalPostback } from '../../../server/postback';
import { env } from 'cloudflare:workers';

export const Route = createFileRoute('/api/internal/scan-results')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Initialize database before any data-ops queries
        initDatabase(env.DB);

        return handleUniversalPostback(request, env);
      },
    },
  },
});
