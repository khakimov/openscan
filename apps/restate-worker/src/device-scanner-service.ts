/**
 * DeviceScanner Virtual Object - Restate Implementation (Phase 3)
 *
 * Manages scheduled scans for individual devices using Restate durable timers.
 * Each schedule is a Virtual Object keyed by scheduleId for isolated state management.
 *
 * Architecture: Pure Virtual Object Pattern (Option 1)
 * - Restate: Manages timers, executes scans, stores runtime state only
 * - TanStack App: Owns all database operations (schedules, concurrency, audit trail)
 * - Communication: HTTP APIs (same pattern as existing postback system)
 *
 * Key Features:
 * - Durable Timers: Schedule scans with delay and automatic retries
 * - Reschedule-First Pattern: Schedule next execution BEFORE running current scan
 * - Concurrency Control: HTTP call to TanStack app to check/acquire slots
 * - Smart Failure Handling: Classify transient vs permanent errors with exponential backoff
 * - Auto-Pause Thresholds: Preset-specific (QUICK=3, STANDARD=5, THOROUGH=8 failures)
 * - Cancellation Support: Explicit timer cancellation via ctx.cancel()
 * - State Management: ctx.get/set for durable K/V storage (runtime only)
 * - Database Sync: TanStack app owns database, Restate posts back results
 *
 * Reference: SCHEDULE.md - Architecture section
 */

import * as restate from '@restatedev/restate-sdk';
import type { ObjectContext, ObjectSharedContext } from '@restatedev/restate-sdk';
import { createLogger } from '@repo/logger';
import { portScanner } from './port-scanner';
import { postUniversalPostback } from './postback';

const logger = createLogger({ name: 'device-scanner' });

// Environment configuration
const TANSTACK_APP_URL = process.env.TANSTACK_APP_URL || 'http://localhost:3000';
const WORKER_API_KEY = process.env.WORKER_API_KEY || '';

// State keys for ctx.get/set (runtime state only)
const STATE_KEYS = {
  SCHEDULE_CONFIG: 'schedule_config',
  NEXT_EXECUTION_ID: 'next_execution_id',
  NEXT_EXECUTION_TIME: 'next_execution_time',
  CONSECUTIVE_FAILURES: 'consecutive_failures',
  LAST_RUN_STATUS: 'last_run_status',
  LAST_RUN_AT: 'last_run_at',
  LEASE_ID: 'lease_id', // Current lease ID for concurrency control
  IS_PAUSED: 'is_paused',
} as const;

// Schedule Interval Types (matching data-ops)
type DurationInterval = {
  kind: 'duration';
  value: number;
  unit: 'minutes' | 'hours' | 'days';
};

type DailyInterval = {
  kind: 'daily';
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string;
};

type ScheduleInterval = DurationInterval | DailyInterval;
type SchedulePreset = 'QUICK' | 'STANDARD' | 'THOROUGH';

// Input/Output Types
interface ScheduleConfig {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  deviceTarget: string; // IP or hostname to scan
  interval: ScheduleInterval;
  preset: SchedulePreset;
  createdBy: string;
}

interface ScheduleDeviceScanInput {
  config: ScheduleConfig;
  startImmediately?: boolean; // Optional: run first scan immediately
}

interface ScheduleState {
  scheduleId: string;
  status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
  nextExecutionTime?: string;
  consecutiveFailures: number;
  lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  lastRunAt?: string;
  currentLeaseId?: string;
}

interface ExecuteScanInput {
  // Internal input - called by durable timer
  scheduleId: string;
  deviceId: string;
  deviceTarget: string;
  organizationId: string;
  preset: SchedulePreset;
}

// Failure Classification
interface ClassifiedError {
  type: 'TRANSIENT' | 'PERMANENT' | 'CONCURRENCY_LIMIT';
  message: string;
  shouldRetry: boolean;
  backoffMs?: number; // For transient errors
}

// Auto-pause thresholds by preset
const AUTO_PAUSE_THRESHOLDS: Record<SchedulePreset, number> = {
  QUICK: 3,
  STANDARD: 5,
  THOROUGH: 8,
};

// Exponential backoff configuration
const BACKOFF_BASE_MS = 5 * 60 * 1000; // 5 minutes
const BACKOFF_MAX_MS = 60 * 60 * 1000; // 1 hour

/**
 * DeviceScanner Virtual Object
 *
 * Keyed by scheduleId (e.g., "schedule-device123-daily")
 * Each schedule has isolated state and durable timers.
 */
export const deviceScanner = restate.object({
  name: 'DeviceScanner',
  handlers: {
    /**
     * Schedule a device scan (create or update schedule)
     *
     * 1. Store config in Restate state (runtime)
     * 2. Calculate next execution time
     * 3. Schedule first timer (reschedule-first pattern)
     *
     * Note: TanStack app already created schedule in DB before calling this
     */
    scheduleDeviceScan: async (
      ctx: ObjectContext,
      input: ScheduleDeviceScanInput
    ): Promise<{ success: true; scheduleId: string; nextRunAt: string }> => {
      const { config, startImmediately } = input;
      const scheduleId = ctx.key; // Virtual Object key

      logger.info('Scheduling device scan', {
        scheduleId,
        deviceId: config.deviceId,
        interval: config.interval,
        preset: config.preset,
        startImmediately,
      });

      // Step 1: Calculate next execution time
      const nextRunAt = startImmediately
        ? new Date()
        : calculateNextExecutionTime(config.interval);

      // Step 2: Store config in Restate state (runtime only)
      ctx.set(STATE_KEYS.SCHEDULE_CONFIG, config);
      ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, 0);
      ctx.set(STATE_KEYS.IS_PAUSED, false);

      // Step 3: Schedule first execution using reschedule-first pattern
      const delay = Math.max(0, nextRunAt.getTime() - Date.now());

      const handle = ctx
        .objectSendClient(deviceScanner, scheduleId, { delay })
        .executeScan({
          scheduleId: config.scheduleId,
          deviceId: config.deviceId,
          deviceTarget: config.deviceTarget,
          organizationId: config.organizationId,
          preset: config.preset,
        });

      // Step 4: Store invocation ID for cancellation
      const invocationId = (await handle.invocationId) as unknown as string;
      ctx.set(STATE_KEYS.NEXT_EXECUTION_ID, invocationId);
      ctx.set(STATE_KEYS.NEXT_EXECUTION_TIME, nextRunAt.toISOString());

      logger.info('Schedule created', {
        scheduleId,
        nextRunAt: nextRunAt.toISOString(),
        invocationId,
      });

      return {
        success: true,
        scheduleId,
        nextRunAt: nextRunAt.toISOString(),
      };
    },

    /**
     * Execute a scheduled scan (called by durable timer)
     *
     * Uses reschedule-first pattern:
     * 1. Schedule next execution FIRST
     * 2. Check concurrency via HTTP API
     * 3. Run scan
     * 4. Postback results to TanStack app
     * 5. Handle failures with backoff
     */
    executeScan: async (
      ctx: ObjectContext,
      input: ExecuteScanInput
    ): Promise<{ success: boolean; status: string; scanId?: string }> => {
      const scheduleId = ctx.key;

      logger.info('Executing scheduled scan', {
        scheduleId,
        deviceId: input.deviceId,
        preset: input.preset,
      });

      // Check if paused
      const isPaused = await ctx.get<boolean>(STATE_KEYS.IS_PAUSED);
      if (isPaused) {
        logger.info('Schedule is paused, skipping execution', { scheduleId });
        return { success: false, status: 'PAUSED' };
      }

      // Get schedule config from state
      const config = await ctx.get<ScheduleConfig>(STATE_KEYS.SCHEDULE_CONFIG);
      if (!config) {
        logger.error('Schedule config not found in state', { scheduleId });
        return { success: false, status: 'CONFIG_MISSING' };
      }

      // RESCHEDULE-FIRST PATTERN: Schedule next execution BEFORE running current scan
      const nextRunTime = calculateNextExecutionTime(config.interval);
      const delay = Math.max(0, nextRunTime.getTime() - Date.now());

      const nextHandle = ctx
        .objectSendClient(deviceScanner, scheduleId, { delay })
        .executeScan(input);

      const nextInvocationId = (await nextHandle.invocationId) as unknown as string;
      ctx.set(STATE_KEYS.NEXT_EXECUTION_ID, nextInvocationId);
      ctx.set(STATE_KEYS.NEXT_EXECUTION_TIME, nextRunTime.toISOString());

      logger.info('Next execution scheduled', {
        scheduleId,
        nextRunTime: nextRunTime.toISOString(),
        nextInvocationId,
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
            return { allowed: false, reason: 'CONCURRENCY_LIMIT' };
          }

          if (!response.ok) {
            throw new Error(`Concurrency check failed: ${response.status}`);
          }

          const data = (await response.json()) as { leaseId: string };
          return { allowed: true, leaseId: data.leaseId };
        } catch (error: any) {
          logger.error('Concurrency check failed', { scheduleId, error });
          throw error;
        }
      });

      if (!canExecute.allowed) {
        logger.warn('Concurrency limit reached, deferring scan', {
          scheduleId,
          organizationId: input.organizationId,
        });
        // Don't count as failure - next timer will try again
        return { success: false, status: 'CONCURRENCY_LIMIT_REACHED' };
      }

      const leaseId = canExecute.leaseId;
      ctx.set(STATE_KEYS.LEASE_ID, leaseId);

      // Step 2: Run the scan
      let scanSuccess = false;
      let scanId: string | undefined;

      try {
        const scanResult = await ctx.run('execute-port-scan', async () => {
          const scanId = `${scheduleId}-${Date.now()}`;

          // Invoke PortScanner service
          await ctx.serviceClient(portScanner).scan({
            target: input.deviceTarget,
            ports: getPortsForPreset(input.preset),
            aggressive: input.preset === 'THOROUGH',
            timeout: getTimeoutForPreset(input.preset),
            scanId,
            deviceId: input.deviceId,
            organizationId: input.organizationId,
            callbackUrl: `${TANSTACK_APP_URL}/api/postback/scheduled-scan`,
          });

          return { scanId };
        });

        scanId = scanResult.scanId;
        scanSuccess = true;

        logger.info('Scan completed successfully', {
          scheduleId,
          scanId,
        });
      } catch (error) {
        const classified = classifyError(error);

        logger.error('Scan execution failed', {
          scheduleId,
          errorType: classified.type,
          error: classified.message,
        });

        await handleFailure(ctx, scheduleId, config, classified);
      } finally {
        // Step 3: Always release slot via HTTP (TanStack app manages DB)
        if (leaseId) {
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

            ctx.clear(STATE_KEYS.LEASE_ID);
            logger.info('Concurrency slot released', { scheduleId, leaseId });
          } catch (error) {
            logger.error('Failed to release slot', { scheduleId, leaseId, error });
            // Don't throw - lease will expire automatically
          }
        }
      }

      // Step 4: Update success state
      if (scanSuccess) {
        ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, 0);
        ctx.set(STATE_KEYS.LAST_RUN_STATUS, 'SUCCESS');
        ctx.set(STATE_KEYS.LAST_RUN_AT, new Date().toISOString());

        // Postback success to TanStack app (updates DB)
        await ctx.run('postback-success', async () => {
          await postUniversalPostback({
            type: 'SCHEDULED_SCAN_EXECUTED',
            scanId: scanId!,
            organizationId: input.organizationId,
            timestamp: new Date().toISOString(),
            status: 'SUCCESS',
            callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
            deviceId: input.deviceId,
            data: {
              scheduleId: input.scheduleId,
              status: 'SUCCESS',
              consecutiveFailures: 0,
              lastRunAt: new Date().toISOString(),
              nextRunAt: nextRunTime.toISOString(),
            },
          });
        });

        logger.info('Scan executed successfully', { scheduleId, scanId });
      }

      return {
        success: scanSuccess,
        status: scanSuccess ? 'SUCCESS' : 'FAILED',
        scanId,
      };
    },

    /**
     * Pause a schedule (manual user action)
     *
     * 1. Cancel pending timer via ctx.cancel()
     * 2. Set paused flag in state
     *
     * Note: TanStack app already updated DB before calling this
     */
    pauseSchedule: async (
      ctx: ObjectContext,
      _input: { pausedBy: string }
    ): Promise<{ success: true }> => {
      const scheduleId = ctx.key;

      logger.info('Pausing schedule', { scheduleId });

      // Cancel next execution
      const nextExecutionId = await ctx.get<string>(STATE_KEYS.NEXT_EXECUTION_ID);
      if (nextExecutionId) {
        ctx.cancel(nextExecutionId as any); // InvocationId is a branded type
        logger.info('Cancelled next execution', { scheduleId, invocationId: nextExecutionId });
      }

      // Update state
      ctx.set(STATE_KEYS.IS_PAUSED, true);
      ctx.clear(STATE_KEYS.NEXT_EXECUTION_ID);
      ctx.clear(STATE_KEYS.NEXT_EXECUTION_TIME);

      logger.info('Schedule paused', { scheduleId });

      return { success: true };
    },

    /**
     * Resume a paused schedule
     *
     * 1. Reset failure count
     * 2. Schedule next execution
     *
     * Note: TanStack app already updated DB before calling this
     */
    resumeSchedule: async (
      ctx: ObjectContext,
      _input: { resumedBy: string }
    ): Promise<{ success: true; nextRunAt: string }> => {
      const scheduleId = ctx.key;

      logger.info('Resuming schedule', { scheduleId });

      // Get config
      const config = await ctx.get<ScheduleConfig>(STATE_KEYS.SCHEDULE_CONFIG);
      if (!config) {
        throw new Error('Schedule config not found');
      }

      // Calculate next run time
      const nextRunTime = calculateNextExecutionTime(config.interval);

      // Update state
      ctx.set(STATE_KEYS.IS_PAUSED, false);
      ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, 0); // Reset failures on resume

      // Schedule next execution
      const delay = Math.max(0, nextRunTime.getTime() - Date.now());
      const handle = ctx
        .objectSendClient(deviceScanner, scheduleId, { delay })
        .executeScan({
          scheduleId: config.scheduleId,
          deviceId: config.deviceId,
          deviceTarget: config.deviceTarget,
          organizationId: config.organizationId,
          preset: config.preset,
        });

      const invocationId = (await handle.invocationId) as unknown as string;
      ctx.set(STATE_KEYS.NEXT_EXECUTION_ID, invocationId);
      ctx.set(STATE_KEYS.NEXT_EXECUTION_TIME, nextRunTime.toISOString());

      logger.info('Schedule resumed', { scheduleId, nextRunAt: nextRunTime.toISOString() });

      return { success: true, nextRunAt: nextRunTime.toISOString() };
    },

    /**
     * Delete a schedule
     *
     * 1. Cancel pending timer
     * 2. Clear all state
     *
     * Note: TanStack app already updated DB (soft delete) before calling this
     */
    deleteSchedule: async (
      ctx: ObjectContext,
      _input: { deletedBy: string }
    ): Promise<{ success: true }> => {
      const scheduleId = ctx.key;

      logger.info('Deleting schedule', { scheduleId });

      // Cancel next execution
      const nextExecutionId = await ctx.get<string>(STATE_KEYS.NEXT_EXECUTION_ID);
      if (nextExecutionId) {
        ctx.cancel(nextExecutionId as any); // InvocationId is a branded type
        logger.info('Cancelled next execution', { scheduleId, invocationId: nextExecutionId });
      }

      // Clear all state
      ctx.clearAll();

      logger.info('Schedule deleted', { scheduleId });

      return { success: true };
    },

    /**
     * Get schedule state (shared handler for non-locking reads)
     *
     * Used by UI to poll current schedule status (via TanStack API)
     */
    getScheduleState: restate.handlers.object.shared(
      async (ctx: ObjectSharedContext): Promise<ScheduleState> => {
        const scheduleId = ctx.key;

        const isPaused = await ctx.get<boolean>(STATE_KEYS.IS_PAUSED);
        const nextExecutionTime = await ctx.get<string>(STATE_KEYS.NEXT_EXECUTION_TIME);
        const consecutiveFailures = (await ctx.get<number>(STATE_KEYS.CONSECUTIVE_FAILURES)) || 0;
        const lastRunStatus = await ctx.get<string>(STATE_KEYS.LAST_RUN_STATUS);
        const lastRunAt = await ctx.get<string>(STATE_KEYS.LAST_RUN_AT);
        const currentLeaseId = await ctx.get<string>(STATE_KEYS.LEASE_ID);

        const status: ScheduleState['status'] = isPaused ? 'PAUSED' : 'ACTIVE';

        return {
          scheduleId,
          status,
          nextExecutionTime: nextExecutionTime || undefined,
          consecutiveFailures,
          lastRunStatus: lastRunStatus as ScheduleState['lastRunStatus'],
          lastRunAt: lastRunAt || undefined,
          currentLeaseId: currentLeaseId || undefined,
        };
      }
    ),
  },
});

/**
 * Calculate next execution time based on interval config
 */
function calculateNextExecutionTime(interval: ScheduleInterval): Date {
  const now = new Date();

  if (interval.kind === 'duration') {
    const ms = convertToMilliseconds(interval.value, interval.unit);
    return new Date(now.getTime() + ms);
  }

  // Daily interval - calculate next occurrence at specified hour:minute
  const next = new Date(now);
  next.setHours(interval.hour, interval.minute, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Convert duration to milliseconds
 */
function convertToMilliseconds(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

/**
 * Get ports to scan based on preset
 */
function getPortsForPreset(preset: SchedulePreset): string {
  const portConfigs: Record<SchedulePreset, string> = {
    QUICK: '21,22,23,25,53,80,110,143,443,445,3389,8080,8443', // Top 13 ports
    STANDARD: '1-1000', // Top 1000 ports
    THOROUGH: '1-65535', // All ports
  };
  return portConfigs[preset];
}

/**
 * Get timeout based on preset
 */
function getTimeoutForPreset(preset: SchedulePreset): number {
  const timeouts: Record<SchedulePreset, number> = {
    QUICK: 30000, // 30 seconds
    STANDARD: 120000, // 2 minutes
    THOROUGH: 300000, // 5 minutes
  };
  return timeouts[preset];
}

/**
 * Classify error as transient or permanent
 *
 * Transient: Network timeouts, rate limits, temporary unavailability
 * Permanent: Invalid configuration, authentication failures, missing resources
 * Concurrency: Organization scan limit reached (handled separately)
 */
function classifyError(error: any): ClassifiedError {
  const message = error?.message?.toLowerCase() || String(error).toLowerCase();

  // Check for concurrency limit (HTTP 429)
  if (message.includes('429') || message.includes('concurrency')) {
    return {
      type: 'CONCURRENCY_LIMIT',
      message: error?.message || String(error),
      shouldRetry: true,
    };
  }

  // Permanent errors (don't retry with backoff)
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

  // Transient errors (retry with backoff)
  const transientPatterns = [
    /timeout/,
    /network/,
    /econnrefused/,
    /enotfound/,
    /rate limit/,
    /temporarily unavailable/,
    /service unavailable/,
  ];

  for (const pattern of transientPatterns) {
    if (pattern.test(message)) {
      return {
        type: 'TRANSIENT',
        message: error?.message || String(error),
        shouldRetry: true,
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
 * Handle scan failure with exponential backoff or auto-pause
 *
 * Postbacks failure info to TanStack app for database updates
 */
async function handleFailure(
  ctx: ObjectContext,
  scheduleId: string,
  config: ScheduleConfig,
  error: ClassifiedError
): Promise<void> {
  const currentFailures = (await ctx.get<number>(STATE_KEYS.CONSECUTIVE_FAILURES)) || 0;
  const newFailureCount = currentFailures + 1;

  ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, newFailureCount);
  ctx.set(STATE_KEYS.LAST_RUN_STATUS, 'FAILED');
  ctx.set(STATE_KEYS.LAST_RUN_AT, new Date().toISOString());

  logger.warn('Scan failed', {
    scheduleId,
    errorType: error.type,
    consecutiveFailures: newFailureCount,
    autoPauseThreshold: AUTO_PAUSE_THRESHOLDS[config.preset],
  });

  // Check if auto-pause threshold reached
  if (newFailureCount >= AUTO_PAUSE_THRESHOLDS[config.preset]) {
    logger.error('Auto-pause threshold reached', {
      scheduleId,
      consecutiveFailures: newFailureCount,
      preset: config.preset,
    });

    // Cancel next execution
    const nextExecutionId = await ctx.get<string>(STATE_KEYS.NEXT_EXECUTION_ID);
    if (nextExecutionId) {
      ctx.cancel(nextExecutionId as any); // InvocationId is a branded type
    }

    ctx.set(STATE_KEYS.IS_PAUSED, true);
    ctx.clear(STATE_KEYS.NEXT_EXECUTION_ID);
    ctx.clear(STATE_KEYS.NEXT_EXECUTION_TIME);

    // Postback auto-pause to TanStack app
    await ctx.run('postback-auto-pause', async () => {
      await postUniversalPostback({
        type: 'SCHEDULE_AUTO_PAUSED',
        scanId: `${scheduleId}-autopause`,
        organizationId: config.organizationId,
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
        deviceId: config.deviceId,
        data: {
          scheduleId: config.scheduleId,
          reason: `Auto-paused after ${newFailureCount} consecutive failures: ${error.message}`,
          consecutiveFailures: newFailureCount,
        },
      });
    });

    return;
  }

  // Calculate backoff for transient errors
  const backoffMs = error.type === 'TRANSIENT'
    ? Math.min(BACKOFF_BASE_MS * Math.pow(2, newFailureCount - 1), BACKOFF_MAX_MS)
    : 0;

  // Postback failure to TanStack app (updates DB)
  await ctx.run('postback-failure', async () => {
    const nextRunTime = error.type === 'TRANSIENT'
      ? new Date(Date.now() + backoffMs)
      : calculateNextExecutionTime(config.interval);

    await postUniversalPostback({
      type: 'SCHEDULED_SCAN_EXECUTED',
      scanId: `${scheduleId}-${Date.now()}`,
      organizationId: config.organizationId,
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      callbackUrl: `${TANSTACK_APP_URL}/api/internal/scan-results`,
      deviceId: config.deviceId,
      data: {
        scheduleId: config.scheduleId,
        status: 'FAILED',
        error: error.message,
        errorType: error.type,
        consecutiveFailures: newFailureCount,
        lastRunAt: new Date().toISOString(),
        nextRunAt: nextRunTime.toISOString(),
        backoffApplied: backoffMs > 0,
        backoffMs,
      },
    });
  });

  if (backoffMs > 0) {
    logger.info('Exponential backoff applied', {
      scheduleId,
      consecutiveFailures: newFailureCount,
      backoffMs,
      backoffMinutes: Math.round(backoffMs / 60000),
    });
  }
}
