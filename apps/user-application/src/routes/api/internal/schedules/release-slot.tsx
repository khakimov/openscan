/**
 * Internal API Route: Release Schedule Concurrency Slot
 *
 * Called by Restate DeviceScanner when a scan completes (success or failure).
 * Releases the concurrency lease so another scan can execute.
 *
 * Authentication: WORKER_API_KEY (not user session)
 *
 * Request Body:
 * {
 *   leaseId: string;
 *   organizationId: string;
 * }
 *
 * Response:
 * - 200: { success: true }
 * - 401: { error: 'Unauthorized' }
 * - 400: { error: 'Invalid request' }
 * - 500: { error: 'Internal server error' }
 */

import { createFileRoute } from '@tanstack/react-router';
import { createLogger } from '@repo/logger';
import { z } from 'zod';
import { releaseScanSlot } from '@repo/data-ops';
import { initDatabase } from '@repo/data-ops/database/setup';
import { env } from 'cloudflare:workers';

const logger = createLogger({ name: 'api-schedules-release-slot' });

const ReleaseSlotRequestSchema = z.object({
  leaseId: z.string().min(1),
  organizationId: z.string().min(1),
});

/**
 * Authenticate request using WORKER_API_KEY
 * Same pattern as can-execute
 */
function authenticateWorkerRequest(request: Request): boolean {
  const apiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    logger.error('WORKER_API_KEY not configured');
    return false;
  }

  const authHeader = request.headers.get('x-worker-key') || request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  // Support both "Bearer <key>" and raw key
  const providedKey = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  return providedKey === apiKey;
}

export const Route = createFileRoute('/api/internal/schedules/release-slot')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();

        // Initialize database before any data-ops queries
        initDatabase(env.DB);

        // Step 1: Authenticate
        if (!authenticateWorkerRequest(request)) {
          logger.warn('Unauthorized release-slot request');
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
          // Step 2: Parse and validate request
          const body = await request.json();
          const parseResult = ReleaseSlotRequestSchema.safeParse(body);

          if (!parseResult.success) {
            const firstError = parseResult.error.issues[0];
            logger.warn('Invalid release-slot request', {
              error: firstError.message,
              path: firstError.path.join('.'),
            });
            return Response.json(
              { error: `Invalid request: ${firstError.message}` },
              { status: 400 }
            );
          }

          const { leaseId, organizationId } = parseResult.data;

          logger.info('Releasing concurrency slot', {
            leaseId,
            organizationId,
          });

          // Step 3: Release the slot
          await releaseScanSlot({
            leaseId,
            organizationId,
          });

          const duration = Date.now() - startTime;
          logger.info('Concurrency slot released', {
            leaseId,
            organizationId,
            duration,
          });

          return Response.json({ success: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to release slot', {
            error: errorMessage,
            duration: Date.now() - startTime,
          });

          return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        }
      },
    },
  },
});
