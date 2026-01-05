/**
 * Internal API Route: Check Schedule Concurrency
 *
 * Called by Restate DeviceScanner to check if a scheduled scan can execute.
 * Implements per-organization concurrency limits using scan_schedule_leases table.
 *
 * Authentication: WORKER_API_KEY (not user session)
 *
 * Request Body:
 * {
 *   organizationId: string;
 *   scheduleId: string;
 *   deviceId: string;
 *   preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
 * }
 *
 * Response:
 * - 200: { allowed: true, leaseId: string }
 * - 429: { allowed: false, reason: 'CONCURRENCY_LIMIT', current: number, limit: number }
 * - 401: { error: 'Unauthorized' }
 * - 400: { error: 'Invalid request' }
 */

import { createFileRoute } from '@tanstack/react-router';
import { createLogger } from '@repo/logger';
import { z } from 'zod';
import {
  acquireScanSlot,
  ConcurrencyLimitError,
  type SchedulePreset,
} from '@repo/data-ops';
import { initDatabase } from '@repo/data-ops/database/setup';
import { env } from 'cloudflare:workers';

const logger = createLogger({ name: 'api-schedules-can-execute' });

const CanExecuteRequestSchema = z.object({
  organizationId: z.string().min(1),
  scheduleId: z.string().min(1),
  deviceId: z.string().min(1),
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
});

/**
 * Authenticate request using WORKER_API_KEY
 * Same pattern as postback authentication
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

export const Route = createFileRoute('/api/internal/schedules/can-execute')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();

        // Initialize database before any data-ops queries
        initDatabase(env.DB);

        // Step 1: Authenticate
        if (!authenticateWorkerRequest(request)) {
          logger.warn('Unauthorized can-execute request');
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
          // Step 2: Parse and validate request
          const body = await request.json();
          const parseResult = CanExecuteRequestSchema.safeParse(body);

          if (!parseResult.success) {
            const firstError = parseResult.error.issues[0];
            logger.warn('Invalid can-execute request', {
              error: firstError.message,
              path: firstError.path.join('.'),
            });
            return Response.json(
              { error: `Invalid request: ${firstError.message}` },
              { status: 400 }
            );
          }

          const { organizationId, scheduleId, deviceId, preset } = parseResult.data;

          logger.info('Checking schedule concurrency', {
            organizationId,
            scheduleId,
            deviceId,
            preset,
          });

          // Step 3: Try to acquire concurrency slot
          try {
            const lease = await acquireScanSlot({
              organizationId,
              scheduleId,
              deviceId,
              preset: preset as SchedulePreset,
            });

            const duration = Date.now() - startTime;
            logger.info('Concurrency slot acquired', {
              organizationId,
              scheduleId,
              leaseId: lease.leaseId,
              duration,
            });

            return Response.json({
              allowed: true,
              leaseId: lease.leaseId,
            });
          } catch (error) {
            // Check if it's a concurrency limit error
            if (error instanceof ConcurrencyLimitError) {
              logger.warn('Concurrency limit reached', {
                organizationId,
                scheduleId,
                current: error.details.current,
                limit: error.details.limit,
              });

              return Response.json(
                {
                  allowed: false,
                  reason: 'CONCURRENCY_LIMIT',
                  current: error.details.current,
                  limit: error.details.limit,
                },
                { status: 429 }
              );
            }

            // Other database errors
            throw error;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Failed to check concurrency', {
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
