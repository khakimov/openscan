/**
 * ScanExecutor Service - Stateless scan execution logic
 *
 * Plain Restate service (not a virtual object) that handles the volatile
 * scan execution logic. Called by DeviceScanner.executeScan via service call.
 *
 * Why this exists:
 * DeviceScanner is a virtual object with durable timers (reschedule-first pattern).
 * Every code change to its handlers shifts journal indices, causing "journal mismatch"
 * errors that break all active schedules. By delegating volatile logic here,
 * DeviceScanner's journal stays stable (~10 entries) and this service can be
 * modified freely across deploys — it starts fresh per call with no replay concerns.
 *
 * Reference: Restate cron_service.ts example uses this exact pattern.
 */

import * as restate from '@restatedev/restate-sdk';
import type { Context } from '@restatedev/restate-sdk';
import { createLogger } from '@repo/logger';
import { portScanner } from './port-scanner';
import { postUniversalPostback } from './postback';
import {
  buildScheduledScanExecutedPostbackPayload,
  buildScheduleAutoPausedPostbackPayload,
} from '@repo/contracts/postbacks';

const logger = createLogger({ name: 'scan-executor' });

// Environment configuration
const TANSTACK_APP_URL = process.env.TANSTACK_APP_URL || 'http://localhost:3000';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// Exponential backoff configuration
const BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_MAX_MS = 60 * 60 * 1000; // 1 hour

// --- Types ---

type SchedulePreset = 'QUICK' | 'STANDARD' | 'THOROUGH';

export interface ScanExecutorInput {
  scheduleId: string;
  deviceId: string;
  deviceTarget: string;
  organizationId: string;
  preset: SchedulePreset;
  consecutiveFailures: number;
  autoPauseThreshold: number;
  nextRunAt: string; // ISO string — for postback payloads
}

export interface ScanExecutorResult {
  outcome: 'SUCCESS' | 'FAILED' | 'AUTO_PAUSED' | 'CONCURRENCY_LIMIT';
  scanId?: string;
  consecutiveFailures: number;
  shouldPause: boolean;
  error?: string;
  errorType?: 'TRANSIENT' | 'PERMANENT' | 'CONCURRENCY_LIMIT';
}

// Failure classification
interface ClassifiedError {
  type: 'TRANSIENT' | 'PERMANENT' | 'CONCURRENCY_LIMIT';
  message: string;
  shouldRetry: boolean;
}

// --- Helper functions ---

function getPortsForPreset(preset: SchedulePreset): string {
  const portConfigs: Record<SchedulePreset, string> = {
    QUICK: '21,22,23,25,53,80,110,143,443,445,3389,8080,8443',
    STANDARD: '1-1000',
    THOROUGH: '1-65535',
  };
  return portConfigs[preset];
}

function getTimeoutForPreset(preset: SchedulePreset): number {
  const timeouts: Record<SchedulePreset, number> = {
    QUICK: 30000,
    STANDARD: 120000,
    THOROUGH: 300000,
  };
  return timeouts[preset];
}

/**
 * Classify error as transient or permanent
 */
function classifyError(error: any): ClassifiedError {
  const message = error?.message?.toLowerCase() || String(error).toLowerCase();

  if (message.includes('429') || message.includes('concurrency')) {
    return {
      type: 'CONCURRENCY_LIMIT',
      message: error?.message || String(error),
      shouldRetry: true,
    };
  }

  const permanentPatterns = [
    /not found/,
    /invalid configuration/,
    /authentication failed/,
    /unauthorized/,
    /forbidden/,
    /device.*deleted/,
    /schedule.*deleted/,
  ];

  for (const pattern of permanentPatterns) {
    if (pattern.test(message)) {
      return {
        type: 'PERMANENT',
        message: error?.message || String(error),
        shouldRetry: false,
      };
    }
  }

  // Default to transient (safer to retry)
  return {
    type: 'TRANSIENT',
    message: error?.message || String(error),
    shouldRetry: true,
  };
}

/**
 * Handle execution failure: classify, postback, determine if auto-pause needed.
 * Returns the result to send back to DeviceScanner.
 */
async function handleExecutionFailure(
  ctx: Context,
  input: ScanExecutorInput,
  error: ClassifiedError,
): Promise<ScanExecutorResult> {
  const newFailureCount = input.consecutiveFailures + 1;

  logger.warn('Scan failed', {
    scheduleId: input.scheduleId,
    errorType: error.type,
    consecutiveFailures: newFailureCount,
    autoPauseThreshold: input.autoPauseThreshold,
  });

  // Check if auto-pause threshold reached
  if (newFailureCount >= input.autoPauseThreshold) {
    logger.error('Auto-pause threshold reached', {
      scheduleId: input.scheduleId,
      consecutiveFailures: newFailureCount,
      preset: input.preset,
    });

    await ctx.run('postback-auto-pause', async () => {
      const autoPausedPayload = buildScheduleAutoPausedPostbackPayload({
        type: 'SCHEDULE_AUTO_PAUSED',
        scanId: `${input.scheduleId}-autopause`,
        organizationId: input.organizationId,
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        deviceId: input.deviceId,
        data: {
          scheduleId: input.scheduleId,
          reason: `Auto-paused after ${newFailureCount} consecutive failures: ${error.message}`,
          consecutiveFailures: newFailureCount,
        },
      });

      await postUniversalPostback({
        callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
        ...autoPausedPayload,
      });
    });

    return {
      outcome: 'AUTO_PAUSED',
      consecutiveFailures: newFailureCount,
      shouldPause: true,
      error: error.message,
      errorType: error.type,
    };
  }

  // Not at threshold — postback failure
  const backoffMs = error.type === 'TRANSIENT'
    ? Math.min(BACKOFF_BASE_MS * Math.pow(2, newFailureCount - 1), BACKOFF_MAX_MS)
    : 0;

  await ctx.run('postback-failure', async () => {
    const failurePayload = buildScheduledScanExecutedPostbackPayload({
      type: 'SCHEDULED_SCAN_EXECUTED',
      scanId: `${input.scheduleId}-${Date.now()}`,
      organizationId: input.organizationId,
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      deviceId: input.deviceId,
      data: {
        scheduleId: input.scheduleId,
        status: 'FAILED',
        error: error.message,
        errorType: error.type,
        consecutiveFailures: newFailureCount,
        lastRunAt: new Date().toISOString(),
        nextRunAt: input.nextRunAt,
        backoffApplied: backoffMs > 0,
        backoffMs,
      },
    });

    await postUniversalPostback({
      callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
      ...failurePayload,
    });
  });

  if (backoffMs > 0) {
    logger.info('Exponential backoff applied', {
      scheduleId: input.scheduleId,
      consecutiveFailures: newFailureCount,
      backoffMs,
      backoffMinutes: Math.round(backoffMs / 60000),
    });
  }

  return {
    outcome: 'FAILED',
    consecutiveFailures: newFailureCount,
    shouldPause: false,
    error: error.message,
    errorType: error.type,
  };
}

// --- Service Definition ---

export const scanExecutor = restate.service({
  name: 'ScanExecutor',
  handlers: {
    /**
     * Execute a scan for a scheduled device.
     *
     * Steps:
     * 1. Check concurrency via HTTP API
     * 2. Call PortScanner service (top-level — preserves Restate delivery guarantees)
     * 3. Release concurrency slot
     * 4. Postback results
     *
     * On error: classify, optionally auto-pause, postback failure info.
     */
    run: restate.handlers.handler(
      {
        // Port scans can take a while, especially THOROUGH preset
        inactivityTimeout: 600000, // 10 minutes
        abortTimeout: 120000, // 2 minutes
      },
      async (ctx: Context, input: ScanExecutorInput): Promise<ScanExecutorResult> => {
        logger.info('ScanExecutor starting', {
          scheduleId: input.scheduleId,
          deviceId: input.deviceId,
          preset: input.preset,
          consecutiveFailures: input.consecutiveFailures,
        });

        // Step 1: Check concurrency via HTTP API
        const canExecute = await ctx.run('check-concurrency', async () => {
          try {
            const response = await fetch(`${TANSTACK_APP_URL}/api/internal/schedules/can-execute`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-worker-key': WORKER_API_KEY,
              },
              body: JSON.stringify({
                organizationId: input.organizationId,
                scheduleId: input.scheduleId,
                deviceId: input.deviceId,
                preset: input.preset,
              }),
            });

            if (response.status === 429) {
              return { allowed: false as const, reason: 'CONCURRENCY_LIMIT' };
            }

            if (!response.ok) {
              throw new Error(`Concurrency check failed: ${response.status}`);
            }

            const data = (await response.json()) as { leaseId: string };
            return { allowed: true as const, leaseId: data.leaseId };
          } catch (error: any) {
            logger.error('Concurrency check failed', { scheduleId: input.scheduleId, error });
            throw error;
          }
        });

        if (!canExecute.allowed) {
          logger.warn('Concurrency limit reached, deferring scan', {
            scheduleId: input.scheduleId,
            organizationId: input.organizationId,
          });
          return {
            outcome: 'CONCURRENCY_LIMIT',
            consecutiveFailures: input.consecutiveFailures,
            shouldPause: false,
          };
        }

        const leaseId = canExecute.leaseId;

        // Helper to release the concurrency slot
        const releaseSlot = async () => {
          try {
            await ctx.run('release-slot', async () => {
              await fetch(`${TANSTACK_APP_URL}/api/internal/schedules/release-slot`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-worker-key': WORKER_API_KEY,
                },
                body: JSON.stringify({
                  leaseId,
                  organizationId: input.organizationId,
                }),
              });
            });
            logger.info('Concurrency slot released', { scheduleId: input.scheduleId, leaseId });
          } catch (error) {
            logger.error('Failed to release slot', { scheduleId: input.scheduleId, leaseId, error });
            // Don't throw - lease will expire automatically
          }
        };

        // Step 2: Run the scan — TOP-LEVEL service call (not inside ctx.run!)
        // This preserves Restate's delivery guarantees for the inter-service call.
        try {
          await ctx.serviceClient(portScanner).scan({
            target: input.deviceTarget,
            ports: getPortsForPreset(input.preset),
            aggressive: input.preset === 'THOROUGH',
            timeout: getTimeoutForPreset(input.preset),
            scanId: `${input.scheduleId}-${Date.now()}`,
            deviceId: input.deviceId,
            organizationId: input.organizationId,
            callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
          });
        } catch (error) {
          // Step 3a: Release slot on failure
          await releaseSlot();

          // Step 4a: Handle failure
          const classified = classifyError(error);
          logger.error('Scan execution failed', {
            scheduleId: input.scheduleId,
            errorType: classified.type,
            error: classified.message,
          });

          return handleExecutionFailure(ctx, input, classified);
        }

        // Step 3: Release slot on success
        await releaseSlot();

        // Step 4: Postback success
        const scanId = `${input.scheduleId}-${Date.now()}`;
        await ctx.run('postback-success', async () => {
          const now = new Date().toISOString();
          const successPayload = buildScheduledScanExecutedPostbackPayload({
            type: 'SCHEDULED_SCAN_EXECUTED',
            scanId,
            organizationId: input.organizationId,
            timestamp: now,
            status: 'SUCCESS',
            deviceId: input.deviceId,
            data: {
              scheduleId: input.scheduleId,
              status: 'SUCCESS',
              consecutiveFailures: 0,
              lastRunAt: now,
              nextRunAt: input.nextRunAt,
            },
          });

          await postUniversalPostback({
            callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
            ...successPayload,
          });
        });

        logger.info('Scan executed successfully', {
          scheduleId: input.scheduleId,
          scanId,
        });

        return {
          outcome: 'SUCCESS',
          scanId,
          consecutiveFailures: 0,
          shouldPause: false,
        };
      },
    ),
  },
});
