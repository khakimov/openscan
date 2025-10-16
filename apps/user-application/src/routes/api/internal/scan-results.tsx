/**
 * Internal API Route: Scan Results Postback
 *
 * Receives scan results from restate-worker via HTTP postback.
 * This endpoint is called by the worker (not by end users).
 *
 * Architecture: apps/restate-worker/CLAUDE.md
 * Data Model: docs/data-model.md
 *
 * Authentication: WORKER_API_KEY (not user session)
 */

import { createFileRoute } from '@tanstack/react-router';
import { handleScanResultsPostback } from '../../../server/scan-results-postback';

// @ts-expect-error - Route path not yet in generated types
export const Route = createFileRoute('/api/internal/scan-results')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return handleScanResultsPostback(request);
      },
    },
  },
});
