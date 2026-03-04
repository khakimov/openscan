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
 * Reference: docs/SCHEDULE/architecture.md
 */

import * as restate from '@restatedev/restate-sdk';
import type { ObjectContext, ObjectSharedContext } from '@restatedev/restate-sdk';
import { createLogger } from '@repo/logger';
import { scanExecutor } from './scan-executor-service';
import type { ScanExecutorResult } from './scan-executor-service';

const logger = createLogger({ name: 'device-scanner' });

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

// Auto-pause thresholds by preset (passed to ScanExecutor)
const AUTO_PAUSE_THRESHOLDS: Record<SchedulePreset, number> = {
  QUICK: 3,
  STANDARD: 5,
  THOROUGH: 8,
};

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

      // IMPORTANT: Use ctx.date.now() for deterministic timestamps (Restate requirement)
      const baseTime = await ctx.date.now();

      logger.info('Scheduling device scan', {
        scheduleId,
        deviceId: config.deviceId,
        interval: config.interval,
        preset: config.preset,
        startImmediately,
      });

      // Step 1: Calculate next execution time
      const nextRunAt = startImmediately
        ? new Date(baseTime)
        : calculateNextExecutionTime(config.interval, baseTime);

      // Step 2: Store config in Restate state (runtime only)
      ctx.set(STATE_KEYS.SCHEDULE_CONFIG, config);
      ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, 0);
      ctx.set(STATE_KEYS.IS_PAUSED, false);

      // Step 3: Schedule first execution using reschedule-first pattern
      const delay = Math.max(0, nextRunAt.getTime() - baseTime);

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
     * 1. Check if paused / get config (stable journal entries)
     * 2. Schedule next execution FIRST
     * 3. Delegate to ScanExecutor service (single service call)
     * 4. Update state based on result
     *
     * This handler is intentionally thin (~10 journal entries) so that
     * code changes to scan logic (in ScanExecutor) don't shift journal
     * indices and break active durable timers.
     */
    executeScan: async (
      ctx: ObjectContext,
      input: ExecuteScanInput
    ): Promise<{ success: boolean; status: string; scanId?: string }> => {
      const scheduleId = ctx.key;

      // IMPORTANT: Use ctx.date.now() for deterministic timestamps (Restate requirement)
      const baseTime = await ctx.date.now();

      logger.info('Executing scheduled scan', {
        scheduleId,
        deviceId: input.deviceId,
        preset: input.preset,
      });

      // Journal 1: Check if paused
      const isPaused = await ctx.get<boolean>(STATE_KEYS.IS_PAUSED);
      if (isPaused) {
        logger.info('Schedule is paused, skipping execution', { scheduleId });
        return { success: false, status: 'PAUSED' };
      }

      // Journal 2: Get schedule config from state
      const config = await ctx.get<ScheduleConfig>(STATE_KEYS.SCHEDULE_CONFIG);
      if (!config) {
        logger.error('Schedule config not found in state', { scheduleId });
        return { success: false, status: 'CONFIG_MISSING' };
      }

      // Journal 3-5: RESCHEDULE-FIRST PATTERN — schedule next execution BEFORE running current scan
      const nextRunTime = calculateNextExecutionTime(config.interval, baseTime);
      const delay = Math.max(0, nextRunTime.getTime() - baseTime);

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

      // Journal 6: Get current failure count
      const consecutiveFailures = (await ctx.get<number>(STATE_KEYS.CONSECUTIVE_FAILURES)) || 0;

      // Journal 7: Delegate ALL volatile logic to ScanExecutor service
      // This is a top-level service call — Restate guarantees delivery.
      // ScanExecutor is a plain service (no replay), so its code can change freely across deploys.
      const result: ScanExecutorResult = await ctx.serviceClient(scanExecutor).run({
        scheduleId: input.scheduleId,
        deviceId: input.deviceId,
        deviceTarget: input.deviceTarget,
        organizationId: input.organizationId,
        preset: input.preset,
        consecutiveFailures,
        autoPauseThreshold: AUTO_PAUSE_THRESHOLDS[input.preset],
        nextRunAt: nextRunTime.toISOString(),
      });

      // Journal 8-10: Update state based on result
      ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, result.consecutiveFailures);

      if (result.outcome !== 'CONCURRENCY_LIMIT') {
        ctx.set(STATE_KEYS.LAST_RUN_STATUS, result.outcome === 'SUCCESS' ? 'SUCCESS' : 'FAILED');
        ctx.set(STATE_KEYS.LAST_RUN_AT, new Date(baseTime).toISOString());
      }

      // Journal 11 (conditional): Auto-pause — cancel next timer and set paused flag
      if (result.shouldPause) {
        logger.info('Auto-pausing schedule after threshold reached', { scheduleId });
        ctx.cancel(nextInvocationId as any);
        ctx.set(STATE_KEYS.IS_PAUSED, true);
        ctx.clear(STATE_KEYS.NEXT_EXECUTION_ID);
        ctx.clear(STATE_KEYS.NEXT_EXECUTION_TIME);
      }

      ctx.clear(STATE_KEYS.LEASE_ID);

      logger.info('Scan execution complete', {
        scheduleId,
        outcome: result.outcome,
        consecutiveFailures: result.consecutiveFailures,
      });

      return {
        success: result.outcome === 'SUCCESS',
        status: result.outcome,
        scanId: result.scanId,
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

      // IMPORTANT: Use ctx.date.now() for deterministic timestamps (Restate requirement)
      const baseTime = await ctx.date.now();

      logger.info('Resuming schedule', { scheduleId });

      // Get config
      const config = await ctx.get<ScheduleConfig>(STATE_KEYS.SCHEDULE_CONFIG);
      if (!config) {
        throw new Error('Schedule config not found');
      }

      // Calculate next run time
      const nextRunTime = calculateNextExecutionTime(config.interval, baseTime);

      // Update state
      ctx.set(STATE_KEYS.IS_PAUSED, false);
      ctx.set(STATE_KEYS.CONSECUTIVE_FAILURES, 0); // Reset failures on resume

      // Schedule next execution
      const delay = Math.max(0, nextRunTime.getTime() - baseTime);
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
 *
 * @param interval - Schedule interval configuration
 * @param baseTime - Deterministic base time (milliseconds since epoch)
 */
function calculateNextExecutionTime(interval: ScheduleInterval, baseTime: number): Date {
  const now = new Date(baseTime);

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

