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
import { getCurrentOrganizationId } from '@/server/utils/auth';
import { getDeviceById } from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import { env } from 'cloudflare:workers';

const logger = createLogger({ name: 'screenshots-api' });

export const Route = createFileRoute('/api/screenshots')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Parse query parameters
          const url = new URL(request.url);
          const r2Key = url.searchParams.get('r2Key');
          const deviceId = url.searchParams.get('deviceId');

          if (!r2Key || !deviceId) {
            return new Response('Missing r2Key or deviceId', { status: 400 });
          }

          // Get current organization
          const organizationId = await getCurrentOrganizationId();

          // Validate device ownership
          const device = await getDeviceById(deviceId, organizationId);

          if (!device) {
            logger.warn('Device not found or unauthorized', {
              deviceId,
              organizationId,
            });
            return new Response('Not found', { status: 404 });
          }

          // Validate R2 key matches organization (prevent cross-org access)
          if (!r2Key.startsWith(`screenshots/${organizationId}/`)) {
            logger.warn('R2 key does not match organization', {
              r2Key,
              organizationId,
            });
            return new Response('Not found', { status: 404 });
          }

          // Fetch screenshot from R2
          if (!env.SCREENSHOTS) {
            throw new Error('R2 bucket not configured');
          }

          const object = await env.SCREENSHOTS.get(r2Key);

          if (!object) {
            logger.warn('Screenshot not found in R2', { r2Key });
            return new Response('Not found', { status: 404 });
          }

          // Return binary data with proper headers
          const arrayBuffer = await object.arrayBuffer();

          logger.info('Screenshot served', {
            r2Key,
            deviceId,
            organizationId,
            sizeBytes: arrayBuffer.byteLength,
          });

          return new Response(arrayBuffer, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'private, max-age=3600',
              'Content-Length': arrayBuffer.byteLength.toString(),
            },
          });
        } catch (error) {
          logger.error('Failed to serve screenshot', {
            error: error instanceof Error ? error.message : String(error),
          });

          return new Response('Not found', { status: 404 });
        }
      },
    },
  },
});
