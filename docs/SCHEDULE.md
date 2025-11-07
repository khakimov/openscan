# Device Scan Scheduling System

## Overview

A robust, universal scheduling system for automated device scanning. Allows users to configure recurring scans (e.g., every 12 hours, twice daily, once per day) with support for pause/resume, failure handling, and compliance-driven requirements.

## Key Requirements

1. **Flexible Intervals**: Support human-friendly intervals (12h, 1d, 2x/day)
2. **Durable Execution**: Survive worker restarts and infrastructure failures
3. **Organization Isolation**: Schedules scoped per organization
4. **Device-Specific**: One schedule per device (1:1 relationship)
5. **Pause/Resume**: Ability to temporarily stop schedules without deleting
6. **Failure Handling**: Retry logic for transient failures, alerting for persistent issues
7. **Audit Trail**: Track when scans run, who created schedules, success/failure history

## Architecture

### Technology Choice: Restate Durable Timers

We'll use **Restate's durable timers** (not cron) because:

- ✅ **Durability**: Timers survive worker restarts/crashes
- ✅ **Exactly-once execution**: No duplicate scans from race conditions
- ✅ **Dynamic scheduling**: Can reschedule/cancel programmatically
- ✅ **Distributed coordination**: Works across multiple worker instances
- ✅ **Simple state management**: No external job queue needed

**Trade-off**: Restate durable timers require a Virtual Object (stateful) instead of a Service (stateless).

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                       User Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  UI Layer    │  │ Server Fns   │  │  Database        │  │
│  │  (Schedule   │→ │  (Create/    │→ │  (scan_schedules)│  │
│  │   Config)    │  │   Update/    │  │                  │  │
│  │              │  │   Delete)    │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                           ↓                                  │
│                    POST to Restate                           │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    Restate Cloud Ingress                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Restate Worker                          │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          DeviceScanner (Virtual Object)                 │ │
│  │                                                          │ │
│  │  State:                                                  │ │
│  │   - scheduleId: string                                   │ │
│  │   - deviceId: string                                     │ │
│  │   - organizationId: string                               │ │
│  │   - interval: ScheduleInterval (duration/daily)          │ │
│  │   - isActive: boolean                                    │ │
│  │   - nextRunAt: Date                                      │ │
│  │   - lastRunAt: Date | null                               │ │
│  │   - consecutiveFailures: number                          │ │
│  │                                                          │ │
│  │  Handlers:                                               │ │
│  │   - scheduleDeviceScan(input) → creates durable timer   │ │
│  │   - pauseSchedule(scheduleId) → cancels timer           │ │
│  │   - resumeSchedule(scheduleId) → recreates timer        │ │
│  │   - deleteSchedule(scheduleId) → cleanup                │ │
│  │   - executeScan() → runs scan, reschedules next         │ │
│  │                                                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              PortScanner (Service)                      │ │
│  │   - Reuses existing port scan workflow                  │ │
│  │   - ctx.run() for durable execution                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                             ↓                                │
│                     Postback to User App                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    User Application                          │
│   - Receives scan results via /api/internal/scan-results    │
│   - Updates scan_runs table                                  │
│   - Tracks schedule execution history                        │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

The `scan_schedules` table already exists (see `packages/data-ops/src/schema/orchestration.ts:48-60`):

```typescript
export const scanSchedules = sqliteTable('scan_schedules', {
  id: cuidText().primaryKey(),
  scheduleId: text('schedule_id').notNull().unique(),        // Restate Virtual Object key
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }).unique(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  interval: text('interval').notNull().default('1h'),        // "12h", "1d", "2d", "7d"
  isActive: integer('is_active', { mode: 'boolean' }),       // Pause/resume state
  createdAt: now(),
});
```

**Proposed Enhancements**:

```typescript
export const scanSchedules = sqliteTable('scan_schedules', {
  id: cuidText().primaryKey(),
  scheduleId: text('schedule_id').notNull().unique(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // Scheduling config
  intervalConfig: jsonb('interval_config').notNull(),         // { kind: 'duration', value: 12, unit: 'hours' }
  interval: text('interval').notNull().default('1d'),         // Cached label for UI ("Every 12 hours")
  preset: text('preset').notNull().default('STANDARD'),       // "QUICK", "STANDARD", "THOROUGH"
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(1),

  // Execution tracking
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  lastRunStatus: text('last_run_status'),                     // "SUCCESS", "FAILED", "PARTIAL"
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),

  // Audit trail
  createdAt: now(),
  createdBy: text('created_by').references(() => auth_user.id),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  pausedAt: integer('paused_at', { mode: 'timestamp_ms' }),
  pausedBy: text('paused_by').references(() => auth_user.id),
}, (t) => ({
  orgIdx: index('scan_schedules_org_idx').on(t.organizationId),
  deviceIdx: index('scan_schedules_device_idx').on(t.deviceId),
  scheduleIdUq: uniqueIndex('scan_schedules_schedule_id_uq').on(t.scheduleId),
  nextRunIdx: index('scan_schedules_next_run_idx').on(t.nextRunAt, t.isActive), // Query "what's due to run?"
}));
```

### Database Operations

**data-ops/src/queries/scan-schedules.ts**:

```typescript
// Create schedule
export async function createScanSchedule(input: {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  interval: ScheduleInterval;
  preset: SchedulePreset;
  nextRunAt: Date;
  createdBy: string;
}): Promise<ScanSchedule>;

// Get schedule by device
export async function getScanScheduleByDeviceId(
  deviceId: string,
  organizationId: string
): Promise<ScanSchedule | null>;

export async function getSchedulesForDevice(
  deviceId: string,
  organizationId: string
): Promise<ScanSchedule[]>;

// Get schedule by ID
export async function getScanScheduleById(
  scheduleId: string,
  organizationId: string
): Promise<ScanSchedule | null>;

// Pause schedule
export async function pauseScanSchedule(
  scheduleId: string,
  organizationId: string,
  pausedBy: string
): Promise<void>;

// Resume schedule
export async function resumeScanSchedule(
  scheduleId: string,
  organizationId: string
): Promise<void>;

// Delete schedule
export async function deleteScanSchedule(
  scheduleId: string,
  organizationId: string
): Promise<void>;

// Update runtime fields atomically (called from Restate)
export async function updateScheduleRuntime(input: {
  scheduleId: string;
  organizationId: string;
  status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED';
  lastRunAt: string | null;
  nextRunAt: string;
  consecutiveFailures: number;
}): Promise<void>;

export async function autoPauseScanSchedule(input: {
  scheduleId: string;
  organizationId: string;
  reason: string;
  consecutiveFailures?: number;
}): Promise<void>;

// List schedules for organization
export async function getSchedulesForOrganization(
  organizationId: string,
  filters?: { isActive?: boolean }
): Promise<ScanSchedule[]>;
```

### State Synchronization & Reconciliation

- ✅ **Source of truth**: `scan_schedules` table stores configuration and last-known execution metadata. Restate keeps only the minimal runtime cache.
- ✅ **All database writes happen inside the Virtual Object** via `ctx.run(...)`, making retries idempotent.
- ⚠️ **Edge case**: If the DB call succeeds but `objectSendClient(... sendOpts)` fails, Restate will replay the handler. `createScanSchedule` must therefore be implemented with `ON CONFLICT DO UPDATE`.
- 💡 **Reconciliation job** runs hourly to detect drift (Restate object missing DB row or vice versa).

```typescript
// data-ops/src/queries/scan-schedules.ts
export async function createScanSchedule(input: {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  interval: ScheduleInterval;
  preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
  nextRunAt: Date;
  createdBy: string;
}): Promise<ScanSchedule> {
  return db
    .insert(scanSchedules)
    .values({
      scheduleId: input.scheduleId,
      deviceId: input.deviceId,
      organizationId: input.organizationId,
      intervalConfig: input.interval, // jsonb column
      interval: formatIntervalLabel(input.interval),
      preset: input.preset,
      nextRunAt: input.nextRunAt,
      status: 'ACTIVE',
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: scanSchedules.scheduleId,
      set: {
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        intervalConfig: input.interval,
        interval: formatIntervalLabel(input.interval),
        preset: input.preset,
        nextRunAt: input.nextRunAt,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    })
    .returning()
    .then((rows) => rows[0]);
}

export async function updateScheduleRuntime(input: {
  scheduleId: string;
  organizationId: string;
  status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED';
  lastRunAt: string | null;
  nextRunAt: string;
  consecutiveFailures: number;
}): Promise<void> {
  await db
    .update(scanSchedules)
    .set({
      status: input.status,
      lastRunAt: input.lastRunAt ? new Date(input.lastRunAt) : null,
      nextRunAt: new Date(input.nextRunAt),
      consecutiveFailures: input.consecutiveFailures,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scanSchedules.scheduleId, input.scheduleId),
        eq(scanSchedules.organizationId, input.organizationId),
      ),
    );
}

export async function autoPauseScanSchedule(input: {
  scheduleId: string;
  organizationId: string;
  reason: string;
  consecutiveFailures?: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const updates: Partial<typeof scanSchedules.$inferInsert> = {
      status: 'AUTO_PAUSED',
      pausedAt: new Date(),
      pausedReason: input.reason,
      updatedAt: new Date(),
    };

    if (typeof input.consecutiveFailures === 'number') {
      updates.consecutiveFailures = input.consecutiveFailures;
    }

    await tx
      .update(scanSchedules)
      .set(updates)
      .where(
        and(
          eq(scanSchedules.scheduleId, input.scheduleId),
          eq(scanSchedules.organizationId, input.organizationId),
        ),
      );

    await tx.insert(scanScheduleEvents).values({
      scheduleId: input.scheduleId,
      organizationId: input.organizationId,
      type: 'AUTO_PAUSED',
      metadata: { reason: input.reason },
      createdAt: new Date(),
    });
  });
}

// workers/reconciliation/src/restate-db-reconciler.ts
export async function reconcileRestateSchedules() {
  const restateState = await restateClient.listObjects<'DeviceScanner'>('DeviceScanner'); // returns { key, state }
  const dbSchedules = await listActiveSchedulesFromDb(); // Map keyed by scheduleId

  // ❌ Restate object without DB row → pause and alert
  for (const orphan of restateState.filter((entry) => !dbSchedules.has(entry.key))) {
    await restateClient.objectSend({
      name: 'DeviceScanner',
      key: orphan.key,
      handler: 'pauseSchedule',
    });
  }

  // ❌ DB row without Restate object → recreate timer (if still ACTIVE)
  for (const schedule of dbSchedules.values()) {
    const exists = restateState.some((entry) => entry.key === schedule.scheduleId);
    if (!exists && schedule.status === 'ACTIVE') {
      await restateClient.objectSend({
        name: 'DeviceScanner',
        key: schedule.scheduleId,
        handler: 'scheduleDeviceScan',
        payload: {
          scheduleId: schedule.scheduleId,
          deviceId: schedule.deviceId,
          organizationId: schedule.organizationId,
          interval: schedule.intervalConfig,
          preset: schedule.preset,
          target: schedule.target,
          createdBy: SYSTEM_USER_ID,
        },
      });
    }
  }
}
```

// ⚠️ EDGE CASE: Ensure deleted schedules are marked `status = 'DELETED'` to avoid being revived during reconciliation.

## Restate Virtual Object Design

### Why Virtual Object vs Service?

| Feature | Service | Virtual Object |
|---------|---------|----------------|
| **State** | Stateless | Stateful per key |
| **Durable Timers** | ❌ Not supported | ✅ Supported |
| **Use Case** | One-off scans | Recurring schedules |
| **Concurrency** | Many parallel invocations | One active per key |

**Decision**: Use Virtual Object keyed by `scheduleId` so each schedule has isolated state while a device can own multiple schedules.

### Virtual Object Implementation

**apps/restate-worker/src/device-scanner-service.ts**:

```typescript
import * as restate from '@restatedev/restate-sdk';
import { DateTime } from 'luxon';
import { createLogger } from '@repo/logger';
import { invokePortScan } from './port-scanner-service';
import { sendPostback } from './utils/postback-client';
import {
  createScanSchedule,
  updateScheduleRuntime,
  autoPauseScanSchedule,
} from '@repo/data-ops/scan-schedules';
import {
  acquireScanSlot,
  releaseScanSlot,
  ConcurrencyLimitError,
} from '@repo/data-ops/scan-schedule-limits';
import {
  scheduledScanDuration,
  scheduledScanFailures,
  scheduleAutoPauses,
  scheduleTimerLag,
} from './device-scanner-metrics';

const logger = createLogger({ name: 'device-scanner' });

type SchedulePreset = 'QUICK' | 'STANDARD' | 'THOROUGH';

type DurationInterval = {
  kind: 'duration';
  value: number;
  unit: 'minutes' | 'hours' | 'days';
};

type DailyInterval = {
  kind: 'daily';
  hour: number;    // 0-23
  minute: number;  // 0-59
  timezone: string;
};

type ScheduleInterval = DurationInterval | DailyInterval;

const FAILURE_THRESHOLDS: Record<SchedulePreset, number> = {
  QUICK: 3,
  STANDARD: 5,
  THOROUGH: 8,
};

const MAX_FAILURE_BACKOFF_MULTIPLIER = 8; // 8x interval
const MAX_BACKOFF_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours cap

/**
 * Virtual Object state for DeviceScanner
 *
 * 🔗 STATE MANAGEMENT PATTERN:
 * - See ctx.get/ctx.set usage in:
 *   /Users/nailert/Projects/current/automate/ui/restate/examples/typescript/end-to-end-applications/food-ordering/app/src/order-app/order_workflow/impl.ts:35-45
 * - State survives worker restarts and can be queried from external handlers
 */
interface DeviceScannerState {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  interval: ScheduleInterval;
  preset: SchedulePreset;
  isActive: boolean;
  nextRunAt: string;         // ISO 8601 timestamp
  lastRunAt: string | null;
  consecutiveFailures: number;
  target: string;            // Device IP or hostname
  pendingTimer?: {           // Tracks durable timer call for idempotency
    callId: string;
    runAt: string;
  };
  inFlight?: {               // Prevent overlapping scans
    startedAt: string;
    scanId: string;
  };
  deferUntil?: string;       // Backoff window end ISO timestamp
}

export const deviceScanner = restate.object({
  name: 'DeviceScanner',

  handlers: {
    /**
     * Schedule a recurring scan for a device
     * Key: scheduleId (allows multiple schedules per device)
     */
    async scheduleDeviceScan(ctx: restate.ObjectContext, input: {
      scheduleId: string;
      deviceId: string;
      organizationId: string;
      interval: ScheduleInterval;
      preset: SchedulePreset;
      target: string;
      createdBy: string;
    }): Promise<{ success: boolean; scheduleId: string; nextRunAt: string }> {
      const scheduleId = ctx.key; // Virtual object key = scheduleId

      if (scheduleId !== input.scheduleId) {
        throw new Error(`Schedule key mismatch: expected ${scheduleId}, received ${input.scheduleId}`);
      }

      logger.info('Scheduling device scan', {
        scheduleId,
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        interval: input.interval,
      });

      const now = new Date();
      const nextRunAt = calculateNextRun({
        from: now,
        interval: input.interval,
      });

      const nextRunIso = nextRunAt.toISOString();
      const schedule = await ctx.run('db:create-schedule', () =>
        createScanSchedule({
          scheduleId,
          deviceId: input.deviceId,
          organizationId: input.organizationId,
          interval: input.interval,
          preset: input.preset,
          nextRunAt,
          createdBy: input.createdBy,
        })
      );
      const timerCallId = buildTimerCallId(scheduleId, nextRunAt);

      const state: DeviceScannerState = {
        scheduleId,
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        interval: input.interval,
        preset: input.preset,
        isActive: true,
        nextRunAt: nextRunIso,
        lastRunAt: null,
        consecutiveFailures: 0,
        target: input.target,
        pendingTimer: {
          callId: timerCallId,
          runAt: nextRunIso,
        },
      };

      ctx.set('state', state);

      // ✅ RECOMMENDED: schedule next run before returning so retries remain idempotent
      // 🔗 PATTERN: /Users/nailert/Projects/current/automate/ui/restate/examples/typescript/patterns-use-cases/src/schedulingtasks/payment_reminders.ts:23-29
      // Shows delayed send with objectSendClient + sendOpts pattern
      scheduleNextInvocation(ctx, scheduleId, nextRunAt, timerCallId);

      logger.info('Device scan scheduled', {
        scheduleId,
        deviceId: input.deviceId,
        nextRunAt: nextRunIso,
      });

      return {
        success: true,
        scheduleId,
        nextRunAt: nextRunIso,
      };
    },

    /**
     * ✅ RECOMMENDED PATTERN: Reschedule-first with idempotent timer guard
     * Called by durable timer
     */
    async executeScan(ctx: restate.ObjectContext): Promise<void> {
      const scheduleId = ctx.key;
      const state = await ctx.get<DeviceScannerState>('state');

      if (!state) {
        logger.warn('No state found for scheduled scan', { scheduleId });
        return;
      }

      if (!state.isActive) {
        logger.info('Schedule is paused, skipping execution', { scheduleId });
        return;
      }

      const deviceId = state.deviceId;
      const now = new Date();
      const startTimestamp = Date.now();
      if (state.deferUntil) {
        const deferUntil = new Date(state.deferUntil);
        if (deferUntil.getTime() > now.getTime()) {
          const deferCallId = buildTimerCallId(state.scheduleId, deferUntil);
          if (state.pendingTimer?.callId !== deferCallId) {
            state.pendingTimer = { callId: deferCallId, runAt: deferUntil.toISOString() };
            state.nextRunAt = deferUntil.toISOString();
            ctx.set('state', state);
            scheduleNextInvocation(ctx, scheduleId, deferUntil, deferCallId);
          }

          logger.info('Skipping execution during backoff window', {
            scheduleId,
            deviceId,
            deferUntil: state.deferUntil,
          });
          return;
        }

        delete state.deferUntil;
        ctx.set('state', state);
      }

      const nextRunAt = calculateNextRun({
        from: now,
        interval: state.interval,
        lastScheduledAt: state.pendingTimer?.runAt,
      });
      const nextRunIso = nextRunAt.toISOString();
      const timerCallId = buildTimerCallId(state.scheduleId, nextRunAt);

      // Idempotent scheduling: only enqueue a new timer if callId changed
      const timerAlreadyScheduled = state.pendingTimer?.callId === timerCallId;
      if (!timerAlreadyScheduled) {
        scheduleNextInvocation(ctx, scheduleId, nextRunAt, timerCallId);
        state.pendingTimer = { callId: timerCallId, runAt: nextRunIso };
        state.nextRunAt = nextRunIso;
        ctx.set('state', state);
      }

      const scheduledFireAt = state.pendingTimer?.runAt ?? state.nextRunAt;
      const driftMs = Math.max(0, now.getTime() - new Date(scheduledFireAt).getTime());
      scheduleTimerLag.record(driftMs, {
        'organization.id': state.organizationId,
        'schedule.preset': state.preset,
      });

      // ⚠️ EDGE CASE: Scan duration > interval (prevent overlap)
      const intervalMs = intervalToMs(state.interval);
      if (state.inFlight) {
        const previousStart = new Date(state.inFlight.startedAt).getTime();
        if (now.getTime() - previousStart < intervalMs) {
          logger.warn('Previous scan still in flight, skipping to avoid overlap', {
            deviceId,
            scheduleId: state.scheduleId,
            lastStartedAt: state.inFlight.startedAt,
            intervalMs,
          });
          return;
        }
      }

      let lease: { leaseId: string } | null = null;
      try {
        lease = await ctx.run('limits.acquire', () =>
          acquireScanSlot({
            organizationId: state.organizationId,
            scheduleId: state.scheduleId,
            deviceId: state.deviceId,
            preset: state.preset,
          })
        );
      } catch (error) {
        if (isConcurrencyLimitError(error)) {
          const retryDelayMs = Math.min(intervalMs, 30_000); // retry within interval window
          const retryAt = new Date(Date.now() + retryDelayMs);
          const retryCallId = buildTimerCallId(state.scheduleId, retryAt);
          state.pendingTimer = { callId: retryCallId, runAt: retryAt.toISOString() };
          state.nextRunAt = retryAt.toISOString();
          ctx.set('state', state);

          scheduleNextInvocation(ctx, scheduleId, retryAt, retryCallId);

          logger.info('Concurrency limit reached, deferring scheduled scan', {
            scheduleId,
            deviceId,
            retryAt: retryAt.toISOString(),
          });
          return;
        }

        throw error;
      }

      const scanId = `scheduled-${state.scheduleId}-${Date.now()}`;
      state.inFlight = { startedAt: now.toISOString(), scanId };
      ctx.set('state', state);

      logger.info('Executing scheduled scan', {
        scheduleId,
        deviceId,
        target: state.target,
        scanId,
      });

      let permanentFailure = false;

      try {
        try {
          // Invoke port scan service (reuses existing PortScanner service)
          const scanResult = await ctx.objectClient<typeof invokePortScan>({
            name: 'PortScanner',
          }, deviceId).scan({
            target: state.target,
            preset: state.preset,
            deviceId: state.deviceId,
            organizationId: state.organizationId,
            scanId,
          });

          state.lastRunAt = now.toISOString();
          state.consecutiveFailures = 0;
          delete state.deferUntil;
          delete state.inFlight;
          ctx.set('state', state);

          logger.info('Scheduled scan completed successfully', {
            scheduleId,
            deviceId,
            scanId: scanResult.scanId,
          });

          scheduledScanDuration.record(Date.now() - startTimestamp, {
            'organization.id': state.organizationId,
            'schedule.preset': state.preset,
            'schedule.id': state.scheduleId,
          });

          await sendPostback({
            type: 'SCHEDULED_SCAN_SUCCESS',
            scheduleId: state.scheduleId,
            deviceId: state.deviceId,
            organizationId: state.organizationId,
            scanResult,
          });

          await ctx.run('db:update-runtime', () =>
            updateScheduleRuntime({
              scheduleId: state.scheduleId,
              organizationId: state.organizationId,
              status: 'ACTIVE',
              nextRunAt: state.pendingTimer?.runAt ?? state.nextRunAt,
              lastRunAt: state.lastRunAt,
              consecutiveFailures: 0,
            })
          );
        } catch (error) {
          const classification = classifyFailure(error);
          scheduledScanDuration.record(Date.now() - startTimestamp, {
            'organization.id': state.organizationId,
            'schedule.preset': state.preset,
            'schedule.id': state.scheduleId,
            outcome: classification.type,
          });

          if (classification.type === 'PERMANENT') {
            permanentFailure = true;
            state.isActive = false;
            state.inFlight && delete state.inFlight;
            delete state.deferUntil;
            ctx.set('state', state);

            scheduledScanFailures.add(1, {
              'organization.id': state.organizationId,
              'schedule.preset': state.preset,
              'failure.type': classification.type,
              'failure.code': classification.code ?? 'unknown',
            });

            await sendPostback({
              type: 'SCHEDULE_AUTO_PAUSED',
              scheduleId: state.scheduleId,
              deviceId: state.deviceId,
              organizationId: state.organizationId,
              reason: classification.reason,
            });

            await ctx.run('db:auto-pause', () =>
              autoPauseScanSchedule({
                scheduleId: state.scheduleId,
                organizationId: state.organizationId,
                reason: classification.reason,
                consecutiveFailures: state.consecutiveFailures,
              })
            );

            scheduleAutoPauses.add(1, {
              'organization.id': state.organizationId,
              'schedule.preset': state.preset,
              reason: classification.reason,
            });

            logger.warn('Permanent failure detected, auto-pausing schedule', {
              scheduleId,
              deviceId,
              reason: classification.reason,
            });
          } else {
            state.consecutiveFailures = (state.consecutiveFailures ?? 0) + 1;
            delete state.inFlight;
            ctx.set('state', state);

            logger.error('Scheduled scan failed', {
              scheduleId,
              deviceId,
              error: error instanceof Error ? error.message : String(error),
              classification,
              consecutiveFailures: state.consecutiveFailures,
            });

            scheduledScanFailures.add(1, {
              'organization.id': state.organizationId,
              'schedule.preset': state.preset,
              'failure.type': classification.type,
              'failure.code': classification.code ?? 'unknown',
            });

            await sendPostback({
              type: 'SCHEDULED_SCAN_FAILURE',
              scheduleId: state.scheduleId,
              deviceId: state.deviceId,
              organizationId: state.organizationId,
              error: error instanceof Error ? error.message : String(error),
              classification,
              consecutiveFailures: state.consecutiveFailures,
            });

            const failureThreshold = FAILURE_THRESHOLDS[state.preset] ?? FAILURE_THRESHOLDS.STANDARD;
            if (state.consecutiveFailures >= failureThreshold) {
              state.isActive = false;
              delete state.pendingTimer;
              delete state.deferUntil;
              ctx.set('state', state);

              const reason = 'failure_threshold_exceeded';
              await sendPostback({
                type: 'SCHEDULE_AUTO_PAUSED',
                scheduleId: state.scheduleId,
                deviceId: state.deviceId,
                organizationId: state.organizationId,
                reason,
              });

              await ctx.run('db:auto-pause', () =>
                autoPauseScanSchedule({
                  scheduleId: state.scheduleId,
                  organizationId: state.organizationId,
                  reason,
                  consecutiveFailures: state.consecutiveFailures,
                })
              );

              scheduleAutoPauses.add(1, {
                'organization.id': state.organizationId,
                'schedule.preset': state.preset,
                reason,
              });

              logger.warn('Auto-paused schedule after consecutive failures', {
                scheduleId,
                deviceId,
                failureThreshold,
              });
            } else {
              const backoffMultiplier = Math.min(
                2 ** state.consecutiveFailures,
                MAX_FAILURE_BACKOFF_MULTIPLIER,
              );
              const backoffMs = Math.min(intervalMs * backoffMultiplier, MAX_BACKOFF_DELAY_MS);
              const deferUntil = new Date(Date.now() + backoffMs);
              state.deferUntil = deferUntil.toISOString();
              const deferCallId = buildTimerCallId(state.scheduleId, deferUntil);
              state.pendingTimer = { callId: deferCallId, runAt: state.deferUntil };
              state.nextRunAt = state.deferUntil;
              ctx.set('state', state);
              scheduleNextInvocation(ctx, scheduleId, deferUntil, deferCallId);

              await ctx.run('db:update-runtime', () =>
                updateScheduleRuntime({
                  scheduleId: state.scheduleId,
                  organizationId: state.organizationId,
                  status: 'ACTIVE',
                  nextRunAt: state.nextRunAt,
                  lastRunAt: state.lastRunAt,
                  consecutiveFailures: state.consecutiveFailures,
                })
              );
            }
          }
        }
      } finally {
        if (lease) {
          await ctx.run('limits.release', () =>
            releaseScanSlot({
              leaseId: lease!.leaseId,
              organizationId: state.organizationId,
            })
          );
        }
      }

      if (permanentFailure) {
        return;
      }
    },

    /**
     * Pause schedule (stops future executions)
     */
    async pauseSchedule(ctx: restate.ObjectContext): Promise<{ success: boolean }> {
      const scheduleId = ctx.key;
      const state = await ctx.get<DeviceScannerState>('state');

      if (!state) {
        throw new Error(`No schedule found for schedule ${scheduleId}`);
      }

      state.isActive = false;
      delete state.pendingTimer;
      ctx.set('state', state);

      logger.info('Schedule paused', { scheduleId, deviceId: state.deviceId });

      return { success: true };
    },

    /**
     * Resume schedule (restarts executions)
     */
    async resumeSchedule(ctx: restate.ObjectContext): Promise<{ success: boolean; nextRunAt: string }> {
      const scheduleId = ctx.key;
      const state = await ctx.get<DeviceScannerState>('state');

      if (!state) {
        throw new Error(`No schedule found for schedule ${scheduleId}`);
      }

      state.isActive = true;
      state.consecutiveFailures = 0;
      delete state.inFlight;
      delete state.deferUntil;

      const now = new Date();
      const nextRunAt = calculateNextRun({
        from: now,
        interval: state.interval,
      });
      const nextRunIso = nextRunAt.toISOString();
      const timerCallId = buildTimerCallId(state.scheduleId, nextRunAt);

      state.nextRunAt = nextRunIso;
      state.pendingTimer = { callId: timerCallId, runAt: nextRunIso };
      ctx.set('state', state);

      scheduleNextInvocation(ctx, scheduleId, nextRunAt, timerCallId);

      logger.info('Schedule resumed', {
        scheduleId,
        deviceId: state.deviceId,
        nextRunAt: nextRunIso,
      });

      return {
        success: true,
        nextRunAt: nextRunIso,
      };
    },

    /**
     * Delete schedule (cleanup state)
     */
    async deleteSchedule(ctx: restate.ObjectContext): Promise<{ success: boolean }> {
      const scheduleId = ctx.key;
      const state = await ctx.get<DeviceScannerState>('state');

      if (!state) {
        return { success: true }; // Already deleted
      }

      // Clear state (cancels future timers automatically)
      ctx.clear('state');

      logger.info('Schedule deleted', { scheduleId, deviceId: state.deviceId });

      return { success: true };
    },

    /**
     * Get current schedule state (for UI polling)
     */
    async getScheduleState(ctx: restate.ObjectContext): Promise<DeviceScannerState | null> {
      return await ctx.get<DeviceScannerState>('state');
    },
  },
});

export const DeviceScanner: typeof deviceScanner = { name: 'DeviceScanner' };

/**
 * Schedule the next scan invocation with durable timer
 *
 * 🔗 PATTERN REFERENCES:
 * - Delayed send with objectSendClient:
 *   /Users/nailert/Projects/current/automate/ui/restate/examples/typescript/patterns-use-cases/src/schedulingtasks/payment_reminders.ts:23-29
 * - Timer delays via sendOpts:
 *   /Users/nailert/Projects/current/automate/ui/restate/examples/typescript/basics/src/1_building_blocks.ts:57-59
 */
function scheduleNextInvocation(
  ctx: restate.ObjectContext,
  scheduleId: string,
  runAt: Date,
  callId: string
) {
  const delayMs = Math.max(0, runAt.getTime() - Date.now());

  try {
    const sendOpts = restate.rpc.sendOpts({
      delay: { milliseconds: delayMs },
      idempotencyKey: callId,
      headers: {
        'x-scheduled-at': runAt.toISOString(),
      },
    });

    ctx.objectSendClient(DeviceScanner, scheduleId).executeScan(sendOpts);
  } catch (error) {
    logger.error('Failed to schedule next invocation', {
      scheduleId,
      runAt: runAt.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function buildTimerCallId(scheduleId: string, runAt: Date): string {
  return `scan:${scheduleId}:${runAt.getTime()}`;
}

function intervalToMs(interval: ScheduleInterval): number {
  if (interval.kind === 'duration') {
    const multiplier =
      interval.unit === 'minutes'
        ? 60 * 1000
        : interval.unit === 'hours'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    return interval.value * multiplier;
  }

  // Daily schedules repeat every 24h
  return 24 * 60 * 60 * 1000;
}

function formatIntervalLabel(interval: ScheduleInterval): string {
  if (interval.kind === 'duration') {
    const unitLabel =
      interval.unit === 'minutes'
        ? interval.value === 1 ? 'minute' : 'minutes'
        : interval.unit === 'hours'
        ? interval.value === 1 ? 'hour' : 'hours'
        : interval.value === 1 ? 'day' : 'days';
    return `Every ${interval.value} ${unitLabel}`;
  }

  const hour = interval.hour.toString().padStart(2, '0');
  const minute = interval.minute.toString().padStart(2, '0');
  return `Daily at ${hour}:${minute} ${interval.timezone}`;
}

/**
 * Calculate next run time while preserving cadence and preventing drift.
 * - Uses last scheduled time when available (stable cadence)
 * - Falls back to "now + interval" on first run or backlog catch-up
 */
function calculateNextRun(input: {
  from: Date;
  interval: ScheduleInterval;
  lastScheduledAt?: string;
}): Date {
  if (input.interval.kind === 'duration') {
    const intervalMs = intervalToMs(input.interval);
    const anchor = input.lastScheduledAt
      ? new Date(input.lastScheduledAt)
      : input.from;

    const candidateTs = anchor.getTime() + intervalMs;
    const minNextTs = input.from.getTime() + intervalMs;

    // Prevent going backwards if anchor + interval is already in the past
    const nextTs = Math.max(candidateTs, minNextTs);

    return new Date(nextTs);
  }

  const { hour, minute, timezone } = input.interval;
  const nowTz = DateTime.fromJSDate(input.from).setZone(timezone);
  let next: DateTime;

  if (input.lastScheduledAt) {
    const last = DateTime.fromISO(input.lastScheduledAt).setZone(timezone);
    next = last.plus({ days: 1 }).set({ hour, minute, second: 0, millisecond: 0 });
  } else {
    next = nowTz.set({ hour, minute, second: 0, millisecond: 0 });
    if (next <= nowTz) {
      next = next.plus({ days: 1 });
    }
  }

  while (next <= nowTz) {
    next = next.plus({ days: 1 });
  }

  return next.toUTC().toJSDate();
}

interface FailureClassification {
  type: 'TRANSIENT' | 'PERMANENT';
  reason: string;
  retryAfterMs?: number;
  code?: string;
}

interface NormalizedScanError {
  message: string;
  code?: string;
  status?: number;
}

function classifyFailure(error: unknown): FailureClassification {
  const normalized = normalizeScanError(error);

  switch (normalized.code) {
    case 'DEVICE_OFFLINE':
    case 'INVALID_TARGET':
    case 'UNAUTHORIZED':
      return { type: 'PERMANENT', reason: normalized.code, code: normalized.code };
    case 'DNS_RESOLUTION_FAILED':
      return { type: 'PERMANENT', reason: normalized.code, code: normalized.code };
    case 'SCAN_TIMEOUT':
      return { type: 'TRANSIENT', reason: normalized.code, code: normalized.code, retryAfterMs: 15_000 };
    case 'TOOL_UNAVAILABLE':
      return { type: 'TRANSIENT', reason: normalized.code, code: normalized.code, retryAfterMs: 60_000 };
    default:
      if (/ENOTFOUND|EHOSTUNREACH|invalid target/i.test(normalized.message)) {
        return { type: 'PERMANENT', reason: normalized.message };
      }
      return { type: 'TRANSIENT', reason: normalized.message };
  }
}

function normalizeScanError(error: unknown): NormalizedScanError {
  if (error && typeof error === 'object') {
    const maybeError = error as { message?: string; code?: string; status?: number };
    return {
      message: maybeError.message ?? JSON.stringify(error),
      code: maybeError.code,
      status: maybeError.status,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  };
}

function isConcurrencyLimitError(error: unknown): error is ConcurrencyLimitError {
  return error instanceof ConcurrencyLimitError;
}
```

## Concurrency Controls

- ✅ **Per-organization semaphore**: Cap scheduled scans (default 5) so we don't flood customer networks.
- ✅ **Priority preservation**: Manual scans request `priority = 'MANUAL'` and can pre-empt scheduled scans via higher weight.
- ⚠️ **Edge case**: Worker crash may orphan a lease. We expire leases automatically (`expires_at`) and reconciliation job clears them.

```typescript
// data-ops/src/queries/scan-schedule-limits.ts
export class ConcurrencyLimitError extends Error {
  constructor(public readonly details: { organizationId: string; limit: number }) {
    super(`Concurrent scan limit exceeded for org ${details.organizationId}`);
  }
}

const scanScheduleLeases = pgTable('scan_schedule_leases', {
  leaseId: uuid('lease_id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull(),
  scheduleId: text('schedule_id').notNull(),
  deviceId: text('device_id').notNull(),
  acquiredAt: timestamp('acquired_at', { mode: 'date' }).defaultNow(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
});

const MAX_CONCURRENT_SCANS_PER_ORG = 5;
const LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes (extend on heartbeat)

export async function acquireScanSlot(input: {
  organizationId: string;
  scheduleId: string;
  deviceId: string;
  preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
}): Promise<{ leaseId: string }> {
  return db.transaction(async (tx) => {
    // Evict expired leases proactively
    await tx.delete(scanScheduleLeases).where(lte(scanScheduleLeases.expiresAt, new Date()));

    const activeCount = await tx
      .select({ count: count() })
      .from(scanScheduleLeases)
      .where(eq(scanScheduleLeases.organizationId, input.organizationId))
      .then((rows) => Number(rows[0]?.count ?? 0));

    if (activeCount >= MAX_CONCURRENT_SCANS_PER_ORG) {
      throw new ConcurrencyLimitError({
        organizationId: input.organizationId,
        limit: MAX_CONCURRENT_SCANS_PER_ORG,
      });
    }

    const lease = await tx
      .insert(scanScheduleLeases)
      .values({
        organizationId: input.organizationId,
        scheduleId: input.scheduleId,
        deviceId: input.deviceId,
        expiresAt: new Date(Date.now() + LEASE_TTL_MS),
      })
      .returning()
      .then((rows) => rows[0]);

    return { leaseId: lease.leaseId };
  });
}

export async function releaseScanSlot(input: {
  leaseId: string;
  organizationId: string;
}): Promise<void> {
  await db
    .delete(scanScheduleLeases)
    .where(
      and(
        eq(scanScheduleLeases.leaseId, input.leaseId),
        eq(scanScheduleLeases.organizationId, input.organizationId),
      ),
    );
}

// 🔗 REFERENCE: apps/restate-worker/src/device-scanner-service.ts (acquire/release wrapper)

// workers/cron/src/scan-schedule-lease-cleaner.ts
export async function cleanupExpiredLeases() {
  const removed = await db
    .delete(scanScheduleLeases)
    .where(lte(scanScheduleLeases.expiresAt, new Date()))
    .returning({ leaseId: scanScheduleLeases.leaseId });

  if (removed.length > 0) {
    logger.warn('Cleaned up expired scan leases', { count: removed.length });
  }
}

scheduleConcurrencyGauge.addCallback(async (observer) => {
  const rows = await db
    .select({
      organizationId: scanScheduleLeases.organizationId,
      active: count().as('active'),
    })
    .from(scanScheduleLeases)
    .groupBy(scanScheduleLeases.organizationId);

  for (const row of rows) {
    observer.observe(Number(row.active), {
      'organization.id': row.organizationId,
    });
  }
});
```

// ⚠️ EDGE CASE: If a scan runs longer than `LEASE_TTL_MS`, extend the lease by calling `ctx.run('limits.extend', ...)` from within the scanning worker heartbeat.

## Server Function API

**apps/user-application/src/server/scan-schedules.ts**:

```typescript
import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import {
  getScanScheduleByDeviceId,
  getSchedulesForDevice,
  getScanScheduleById,
  pauseScanSchedule,
  resumeScanSchedule,
  deleteScanSchedule,
  getDeviceById,
} from '@repo/data-ops';
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth';
import { RestateOrchestrator } from './discovery/services/workflow-orchestrator-restate';
import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';

const logger = createLogger({ name: 'scan-schedules-server' });

const ScheduleIntervalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('duration'),
    value: z.number().int().positive().max(1440),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
  z.object({
    kind: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    timezone: z.string().min(1),
  }),
]);

const CreateScheduleSchema = z.object({
  deviceId: z.string().min(1),
  interval: ScheduleIntervalSchema,
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
});

/**
 * Create a scan schedule for a device
 */
export const createDeviceScanSchedule = createServerFn({ method: 'POST' })
  .inputValidator(CreateScheduleSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      // Validate device exists and belongs to organization
      const device = await getDeviceById(data.deviceId, organizationId);
      if (!device) {
        throw new Error('Device not found or access denied');
      }

      // Enforce max schedules per device (default 5)
      const existingSchedules = await getSchedulesForDevice(data.deviceId, organizationId);
      const MAX_SCHEDULES_PER_DEVICE = 5;
      if (existingSchedules.length >= MAX_SCHEDULES_PER_DEVICE) {
        throw new Error(`Device already has ${existingSchedules.length} schedules (limit ${MAX_SCHEDULES_PER_DEVICE})`);
      }

      // Call Restate to create schedule, persist, and start durable timer (saga)
      const orchestrator = new RestateOrchestrator();
      const scheduleId = createId();
      const result = await orchestrator.scheduleDeviceScan({
        scheduleId,
        deviceId: device.id,
        organizationId,
        interval: data.interval,
        preset: data.preset,
        target: device.ip || device.name,
        createdBy: user.id,
      });

      const schedule = await getScanScheduleById(scheduleId, organizationId);
      if (!schedule) {
        throw new Error('Schedule persisted in Restate but missing in DB (reconciliation required)');
      }

      logger.info('Scan schedule created', {
        scheduleId: result.scheduleId,
        deviceId: device.id,
        interval: data.interval,
      });

      return {
        success: true,
        schedule,
        nextRunAt: result.nextRunAt,
      };
    } catch (error) {
      logger.error('Failed to create scan schedule', { error });
      throw error;
    }
  });

/**
 * Pause a scan schedule
 */
export const pauseDeviceScanSchedule = createServerFn({ method: 'POST' })
  .inputValidator((data: { scheduleId: string }) => data)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      const schedule = await getScanScheduleById(data.scheduleId, organizationId);
      if (!schedule) {
        throw new Error('Schedule not found');
      }

      // Pause in database
      await pauseScanSchedule(schedule.scheduleId, organizationId, user.id);

      // Pause in Restate
      const orchestrator = new RestateOrchestrator();
      await orchestrator.pauseSchedule(schedule.scheduleId);

      logger.info('Scan schedule paused', { scheduleId: schedule.scheduleId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to pause scan schedule', { error });
      throw error;
    }
  });

// Similar handlers for resume, delete, getSchedule...
```

**Restate Orchestrator helper**:

```typescript
import { connect as connectRestate } from '@restatedev/restate-sdk-clients';

export class RestateOrchestrator {
  private client = connectRestate({ url: process.env.RESTATE_URL ?? 'http://localhost:8080' });

  async scheduleDeviceScan(input: {
    scheduleId: string;
    deviceId: string;
    organizationId: string;
    interval: ScheduleInterval;
    preset: SchedulePreset;
    target: string;
    createdBy: string;
  }) {
    return this.client
      .objectClient(DeviceScanner, input.scheduleId)
      .scheduleDeviceScan(input);
  }

  async pauseSchedule(scheduleId: string) {
    return this.client.objectClient(DeviceScanner, scheduleId).pauseSchedule();
  }
}
```

## Authorization & Governance

- ✅ **Role-based access**: Only organization admins (or members with `scan_schedules:manage`) can create/edit/delete schedules.
- ✅ **Quota enforcement**:
  - Per-device cap of 5 schedules (feature flag adjustable) (`docs/SCHEDULE.md:720`–`docs/SCHEDULE.md:728`).
  - Organization-wide semaphore ensures no more than N concurrent scans (`docs/SCHEDULE.md:700`–`docs/SCHEDULE.md:756`).
- ✅ **Verification guard**: Reject scheduling on unverified devices unless caller holds `scan_schedules:manage_unverified`.
- ✅ **Audit trail**: Every mutation records a `scan_schedule_events` entry with actor + metadata.

```typescript
function assertCanManageSchedules(user: CurrentUser, orgId: string) {
  if (!user.permissions.includes('scan_schedules:manage')) {
    throw new Error('Insufficient permissions to manage schedules');
  }
  if (user.organizationId !== orgId) {
    throw new Error('Cross-organization access denied');
  }
}

export const createDeviceScanSchedule = createServerFn({ method: 'POST' })
  .inputValidator(CreateScheduleSchema.parse)
  .handler(async ({ data }) => {
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentUser();

    assertCanManageSchedules(user, organizationId);

    // ... existing workflow
  });
```

- ⚠️ **Future work**: integrate billing limits (e.g., schedules per plan) and expose remaining quota via API for UI to show warnings.

## UI Components

### Schedule Configuration Toggle

**apps/user-application/src/features/assets/components/device-schedule-toggle.tsx**:

```tsx
'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createDeviceScanSchedule, pauseDeviceScanSchedule } from '@/server/scan-schedules';

interface DeviceScheduleToggleProps {
  deviceId: string;
  currentSchedule?: {
    isActive: boolean;
    interval: string;
    preset: string;
  };
}

export function DeviceScheduleToggle({ deviceId, currentSchedule }: DeviceScheduleToggleProps) {
  const [interval, setInterval] = useState(currentSchedule?.interval || '1d');
  const [preset, setPreset] = useState(currentSchedule?.preset || 'STANDARD');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createDeviceScanSchedule,
    onSuccess: () => {
      toast.success('Scan schedule created');
      queryClient.invalidateQueries({ queryKey: ['device-schedule', deviceId] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: pauseDeviceScanSchedule,
    onSuccess: () => {
      toast.success('Scan schedule paused');
      queryClient.invalidateQueries({ queryKey: ['device-schedule', deviceId] });
    },
  });

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      createMutation.mutate({ deviceId, interval, preset });
    } else {
      pauseMutation.mutate({ deviceId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Automated Scanning</Label>
        <Switch
          checked={currentSchedule?.isActive || false}
          onCheckedChange={handleToggle}
          disabled={createMutation.isPending || pauseMutation.isPending}
        />
      </div>

      {currentSchedule?.isActive && (
        <div className="space-y-2 pl-4 border-l-2">
          <div>
            <Label>Interval</Label>
            <Select value={interval} onValueChange={setInterval}>
              <option value="12h">Every 12 hours</option>
              <option value="1d">Daily</option>
              <option value="2d">Every 2 days</option>
              <option value="7d">Weekly</option>
              <option value="30d">Monthly</option>
            </Select>
          </div>

          <div>
            <Label>Scan Type</Label>
            <Select value={preset} onValueChange={setPreset}>
              <option value="QUICK">Quick (Top 1000 ports)</option>
              <option value="STANDARD">Standard (Top 10,000 ports)</option>
              <option value="THOROUGH">Thorough (All 65,535 ports)</option>
            </Select>
          </div>

          <Button size="sm" onClick={() => createMutation.mutate({ deviceId, interval, preset })}>
            Update Schedule
          </Button>
        </div>
      )}
    </div>
  );
}
```

## Failure Handling

### Classification Matrix

| Code | Type | Action |
|------|------|--------|
| `DEVICE_OFFLINE`, `INVALID_TARGET`, `UNAUTHORIZED` | Permanent | Auto-pause immediately, notify user |
| `DNS_RESOLUTION_FAILED` | Permanent | Auto-pause (requires user input) |
| `SCAN_TIMEOUT` | Transient | Retry after 15s, keep schedule active |
| `TOOL_UNAVAILABLE`, `WORKER_UNHEALTHY` | Transient | Retry after 60s, raise warning if persists |
| _Default_ | Transient | Retry with exponential backoff (cap 6h) |

`classifyFailure()` (see `docs/SCHEDULE.md:640`) normalizes port-scanner errors into the matrix above.

### Auto-Pause Thresholds

- ✅ `QUICK` preset pauses after **3** consecutive transient failures.
- ✅ `STANDARD` pauses after **5**.
- ✅ `THOROUGH` pauses after **8** (longer scans, more tolerant).
- ✅ Permanent failures skip thresholds and pause immediately.
- ⚠️ Threshold is configurable per org via feature flag (`scan-schedule.failure-threshold.override`).

### Backoff & Defer

- ✅ On each transient failure we compute `backoffMs = min(interval * 2^failures, 6h)` and set `state.deferUntil`.
- ✅ The next timer fires as usual, but handler exits early until `deferUntil` (avoids rescheduling churn).
- ✅ When limits are reached, we pause and emit `SCHEDULE_AUTO_PAUSED (reason: failure_threshold_exceeded)`.
- ⚠️ `deferUntil` clears automatically on success so cadence resumes without drift.

### Alerting & UX

- **Postback events**:

```typescript
// apps/user-application/src/server/postback/types.ts

export type ScheduledScanPostback =
  | {
      type: 'SCHEDULED_SCAN_SUCCESS';
      scheduleId: string;
      deviceId: string;
      organizationId: string;
      scanResult: ScanResult;
    }
  | {
      type: 'SCHEDULED_SCAN_FAILURE';
      scheduleId: string;
      deviceId: string;
      organizationId: string;
      error: string;
      classification: {
        type: 'TRANSIENT' | 'PERMANENT';
        code?: string;
        retryAfterMs?: number;
      };
      consecutiveFailures: number;
    }
  | {
      type: 'SCHEDULE_AUTO_PAUSED';
      scheduleId: string;
      deviceId: string;
      organizationId: string;
      reason: string;
    };
```

- 🔔 **Notifications**: When a schedule auto-pauses, send in-app alert + email with most recent failure details. Link to retry/resume.
- 📈 **Analytics**: Track `schedule_auto_paused` count per org/day. Alerts fire when >10/hour (`docs/SCHEDULE-REVIEW-PROMPT.md` observability plan).
- 🔄 **Recovery**: Resume action clears `consecutiveFailures`, resets `deferUntil`, and immediately schedules next scan.

## Testing Strategy

- ✅ **Unit coverage (90% target)**: isolate helpers (`calculateNextRun`, `classifyFailure`, `intervalToMs`) with plain Vitest + mocks.
- ✅ **Integration tests**: spin up `RestateTestEnvironment` (Testcontainers) alongside SQLite to verify DB + VO saga, concurrency limits, and failure auto-pause logic.
- ✅ **Chaos suite**: nightly job injects random failures (timeouts, lease exhaustion) using containerized Restate + fault-injection hooks.
- ✅ **Time control**: keep test intervals short (seconds/minutes) and poll via helper `waitUntil`; no built-in time-travel in SDK 1.9.

🔗 **TIMER TESTING REFERENCES**:
- Timer patterns with `ctx.sleep()` and `RestatePromise.race()`:
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/tutorials/tour-of-workflows-typescript/src/workflows/signup-with-timers.ts:19-28`
- Timeout pattern with awakeables:
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/tutorials/tour-of-orchestration-typescript/src/timers/service.ts:20-25`

```typescript
// apps/restate-worker/src/__tests__/device-scanner.test.ts
import { RestateTestEnvironment } from '@restatedev/restate-sdk-testcontainers';
import * as restate from '@restatedev/restate-sdk';
import { DeviceScanner, deviceScanner } from '../device-scanner-service';

describe('DeviceScanner - scheduler', () => {
  let env: RestateTestEnvironment;
  let client: ReturnType<typeof restate.connect>;

  beforeAll(async () => {
    env = await RestateTestEnvironment.start({ objects: [deviceScanner] });
    client = restate.connect({ url: env.baseUrl() });
  });

  afterAll(async () => {
    await client.close();
    await env.stop();
  });

  it('reschedules before scan and survives handler failure', async () => {
    const scheduleId = 'sched-123';
    await client
      .objectClient(DeviceScanner, scheduleId)
      .scheduleDeviceScan({
        scheduleId,
        deviceId: 'device-1',
        organizationId: 'org-1',
        interval: { kind: 'duration', value: 1, unit: 'minutes' },
        preset: 'STANDARD',
        target: '1.1.1.1',
        createdBy: 'user-1',
      });

    // Simulate a failure by marking the downstream port scan as failing once (stubbed dependency)
    // ...

    await waitUntil(async () => {
      const state = await env.stateOf(DeviceScanner, scheduleId).getAll();
      return state?.consecutiveFailures === 1;
    });
  });
});

async function waitUntil(predicate: () => Promise<boolean>, opts: { timeout?: number; interval?: number } = {}) {
  const timeout = opts.timeout ?? 5000;
  const interval = opts.interval ?? 50;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitUntil timed out after ${timeout}ms`);
}
```

```typescript
// apps/user-application/src/server/__tests__/scan-schedules.integration.test.ts

describe('Scan Schedule API', () => {
  it('saves schedule via saga and starts timer', async () => {
    const response = await createDeviceScanSchedule({
      deviceId: 'device-1',
      interval: { kind: 'duration', value: 12, unit: 'hours' },
      preset: 'STANDARD',
    });

    expect(response.success).toBe(true);
    const schedule = await getScanScheduleById(response.schedule.scheduleId, organizationId);
    expect(schedule?.intervalConfig).toMatchObject({ kind: 'duration', value: 12, unit: 'hours' });
  });

  it('enforces per-device quota', async () => {
    await expect(
      createDeviceScanSchedule({
        deviceId: 'device-1',
        interval: { kind: 'duration', value: 1, unit: 'hours' },
        preset: 'QUICK',
      }),
    ).rejects.toThrow(/limit/);
  });
});
```

### Chaos & Failure Scenarios

- **Worker restart**: kill worker mid-execution in TestDriver (`driver.restartWorker()`) and assert timer survives.
- **Lease exhaustion**: seed `scan_schedule_leases` with `MAX_CONCURRENT_SCANS_PER_ORG` rows and verify handler defers + reschedules.
- **Database outage**: mock `ctx.run('db:update-runtime')` to throw and ensure handler retries + reconciliation job resolves state.

### Environments

- **Local**: Restate TestDriver + SQLite (default). Use `pnpm test scheduler`.
- **CI**: GitHub Actions job runs unit + integration suites in parallel; publishes coverage badge (`reports/schedule-coverage`).
- **Staging**: Deploy to Restate Cloud `staging` namespace with feature flag on limited orgs, run synthetic cron to validate timer accuracy.
- **Chaos**: Nightly cron executes chaos suite against staging to validate resilience.

## Monitoring & Observability

### Metrics & Instrumentation

- ✅ Emit OpenTelemetry metrics from the worker:

```typescript
// apps/restate-worker/src/device-scanner-metrics.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('device-scanner');

export const scheduledScanDuration = meter.createHistogram('scheduler.scan.duration', {
  description: 'Time from invocation to scan completion',
  unit: 'ms',
});

export const scheduledScanFailures = meter.createCounter('scheduler.scan.failures', {
  description: 'Count of failed scheduled scans by classification',
});

export const scheduleAutoPauses = meter.createCounter('scheduler.auto_pause.total', {
  description: 'Auto-pauses triggered by the scheduler',
});

export const scheduleTimerLag = meter.createHistogram('scheduler.timer.lag', {
  description: 'Difference between planned nextRunAt and actual fire time',
  unit: 'ms',
});

export const scheduleConcurrencyGauge = meter.createObservableGauge('scheduler.org.concurrency', {
  description: 'Active leases per organization',
});

// Inside executeScan()
const driftMs = Math.max(0, now.getTime() - new Date(state.pendingTimer?.runAt ?? state.nextRunAt).getTime());
scheduleTimerLag.record(driftMs, {
  'organization.id': state.organizationId,
  'schedule.preset': state.preset,
});

scheduledScanDuration.record(Date.now() - startTimestamp, {
  'organization.id': state.organizationId,
  'schedule.preset': state.preset,
});

scheduledScanFailures.add(1, {
  'organization.id': state.organizationId,
  'failure.type': classification.type,
  'failure.code': classification.code ?? 'unknown',
});
```

- ✅ `scheduleConcurrencyGauge` observes the active row count from `scan_schedule_leases` to visualize saturation.
- ✅ Emit structured logs with `scanId`, `scheduleId`, and `traceId` for correlation.
- ⚠️ Propagate `traceparent` through `invokePortScan` so manual investigations can trace DB → Restate → scanner.

### Timer Drift Detection

```sql
SELECT
  organization_id,
  AVG(timer_lag_ms) AS avg_lag,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY timer_lag_ms) AS p95_lag
FROM workers_metrics.scheduler_timer_lag
WHERE timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY organization_id
HAVING PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY timer_lag_ms) > 300000; -- >5 minutes
```

- Trigger PagerDuty warning when 95th percentile timer lag exceeds 5 minutes.
- Include concurrency gauge snapshots in the alert payload to diagnose contention.

### Analytics & Dashboards

- Extend Workers Analytics Engine dataset with the following events:
  - `scheduled_scan_success`
  - `scheduled_scan_failure`
  - `scheduled_scan_auto_paused`
  - `scheduler_concurrency_deferred`

```sql
-- Failure rate + auto-pause trend (7-day rolling)
SELECT
  date_trunc('hour', timestamp) AS hour_bucket,
  COUNT(*) FILTER (WHERE index1 = 'scheduled_scan_failure') AS failures,
  COUNT(*) FILTER (WHERE index1 = 'scheduled_scan_success') AS successes,
  COUNT(*) FILTER (WHERE index1 = 'scheduled_scan_auto_paused') AS auto_pauses,
  ROUND(CASE WHEN successes + failures = 0 THEN 0 ELSE successes * 100.0 / (successes + failures) END, 2) AS success_rate_pct
FROM scheduled_scan_events
WHERE timestamp >= NOW() - INTERVAL '7' DAY
GROUP BY hour_bucket
ORDER BY hour_bucket DESC;
```

- Grafana dashboards:
  - `Scheduler Overview`: success rate, auto-pause count, timer lag P95, active leases.
  - `Organization Drilldown`: filter by org → show schedule health, top failing targets, current defer windows.

### Alerting Rules

1. **Auto-Pause Spike** – `scheduled_scan_auto_paused` > 10 in 1 hour → PagerDuty warning.
2. **Timer Drift** – P95 timer lag > 5 minutes for 3 consecutive buckets → PagerDuty critical.
3. **Lease Saturation** – Active leases = limit for >5 minutes → Slack notification to SRE channel.

### Tracing

- Inject `traceId` and `spanId` into postback payload so UI can link to trace.
- Use `ctx.startChildSpan('invokePortScan')` to capture scanner duration separately.
- Store `traceId` on `scan_schedule_events` table for audit trail queries.

## Rollout Plan

- Greenfield feature: no legacy schedules to migrate.
- Ship behind `scan_scheduling.enabled` feature flag; enable per-org once worker + UI deployed.
- Use staging environment to validate with synthetic orgs before toggling in production.
- Reconciliation job handles any partially-created schedules during development resets.

## Open Questions

1. **Cron/Larger Intervals**: Do we need a third `ScheduleInterval` kind (weekly/cron) for advanced users?
2. **Organization quotas**: How should plan tiers map to per-device/per-org schedule limits (beyond defaults)?
3. **Billing Implications**: Should scheduled scans count toward usage quotas? (pricing team input required)

## References

### Official Restate Docs
- Restate Durable Timers: https://docs.restate.dev/develop/ts/awakeable-timers
- Virtual Objects: https://docs.restate.dev/develop/ts/virtual-objects

### Restate Example Code (Local Reference)
- **Delayed send pattern** (payment reminders):
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/patterns-use-cases/src/schedulingtasks/payment_reminders.ts`
- **Timer building blocks** (ctx.sleep, sendOpts):
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/basics/src/1_building_blocks.ts`
- **Workflow timers** (RestatePromise.race, orTimeout):
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/tutorials/tour-of-workflows-typescript/src/workflows/signup-with-timers.ts`
- **Awakeable timeouts**:
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/tutorials/tour-of-orchestration-typescript/src/timers/service.ts`
- **Virtual Object state management** (food ordering workflow):
  `/Users/nailert/Projects/current/automate/ui/restate/examples/typescript/end-to-end-applications/food-ordering/app/src/order-app/order_workflow/impl.ts`

### Internal Codebase
- Existing Port Scanner: `apps/restate-worker/src/port-scanner-service.ts`
- Postback System: `apps/user-application/src/server/postback/`
