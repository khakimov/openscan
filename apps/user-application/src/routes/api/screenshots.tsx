/**
 * Screenshots API Route
 *
 * Serves screenshots from R2 with ownership validation.
 *
 * Security:
 * - Validates device ownership before serving
 * - Validates R2 key matches organization
 * - Returns 404 for unauthorized access (don't leak existence)
 *
 * Usage:
 * GET /api/screenshots?r2Key=screenshots/org_123/dev_456/scan_789/443-2024.png&deviceId=dev_456
 */

import { createFileRoute } from '@tanstack/react-router';
import { getScreenshot } from '@/server/screenshots';

export const Route = createFileRoute('/api/screenshots')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Parse query parameters
        const url = new URL(request.url);
        const r2Key = url.searchParams.get('r2Key');
        const deviceId = url.searchParams.get('deviceId');

        if (!r2Key || !deviceId) {
          return new Response('Missing r2Key or deviceId', { status: 400 });
        }

        // Call server function
        return getScreenshot({
          data: { r2Key, deviceId },
        });
      },
    },
  },
});
