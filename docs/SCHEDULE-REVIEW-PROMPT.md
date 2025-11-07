# Technical Review Request: Device Scan Scheduling System

## Context

I'm designing a recurring device scan scheduling system for our security platform using Restate (durable workflow orchestration). I've created two documents:

1. **[docs/SCHEDULE.md](./SCHEDULE.md)** - Full design specification
2. **[docs/SCHEDULE-REVIEW.md](./SCHEDULE-REVIEW.md)** - 10 open questions with alternatives

## What I Need

I need **technical guidance with concrete code samples and implementation patterns** for the 10 decision points outlined in SCHEDULE-REVIEW.md. Please write your recommendations **directly in the documents** with:

- ✅ Chosen approach with justification
- 📝 Code examples showing the pattern
- ⚠️ Edge cases and gotchas to watch for
- 🔗 References to similar patterns in our codebase or industry examples

## Specific Requests by Question

### Q1: Virtual Object Key Strategy
**Add to document**:
- Final decision on keying (deviceId vs scheduleId vs composite)
- Code showing how to handle "multiple schedules per device" if we choose deviceId
- Pattern for querying schedules by device if we choose scheduleId
- Restate state size implications and best practices

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Key by deviceId with schedule variants
export const deviceScanner = restate.object({
  name: 'DeviceScanner',

  handlers: {
    async scheduleDeviceScan(ctx: ObjectContext, input: {
      variant: 'quick' | 'thorough';  // Handle multiple types in one object
      interval: string;
    }) {
      const deviceId = ctx.key;

      // Store multiple schedules in state
      const schedules = await ctx.get<ScheduleMap>('schedules') ?? {};
      schedules[input.variant] = { interval: input.interval, ... };
      ctx.set('schedules', schedules);

      // ... timer logic
    }
  }
});

// ⚠️ EDGE CASE: What if user wants 3 different intervals for "quick"?
// 🔗 REFERENCE: Similar pattern in apps/restate-worker/src/port-scanner-service.ts
```

---

### Q2: Timer Rescheduling Pattern
**Add to document**:
- Definitive pattern for rescheduling (before/after/native)
- How Restate handles `ctx.objectSendClient(...).executeScan(...)` failures
- Pattern for preventing schedule drift
- Code showing recovery from worker restart mid-execution

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Reschedule-first with idempotency
async executeScan(ctx: ObjectContext) {
  const state = await ctx.get<ScheduleState>('state');

  // 1. Calculate and schedule NEXT run first (survives failures)
  const nextRunAt = calculateNextRun(new Date(), state.interval);
  const delayMs = Math.max(0, nextRunAt.getTime() - Date.now());
  const timerId = `scan-${state.deviceId}-${nextRunAt.getTime()}`;
  ctx
    .objectSendClient(DeviceScanner, ctx.key)
    .executeScan(
      restate.rpc.sendOpts({
        delay: { milliseconds: delayMs },
        idempotencyKey: timerId,
      }),
    );

  // 3. NOW run the scan (if this fails, timer already scheduled)
  try {
    await ctx.run('scan', () => invokePortScan(...));
  } catch (error) {
    // Timer already set, will retry next interval
    // Just record failure for monitoring
  }
}

// ⚠️ EDGE CASE: Scan duration > interval (next timer fires while current scan running)
// Pattern: Check `lastRunAt` before starting scan, skip if < interval elapsed

// 🔗 RESTATE DOCS: https://docs.restate.dev/develop/ts/awakeable-timers#delayed-calls
// 🔗 EXAMPLE: Delayed send pattern - restate/examples/typescript/patterns-use-cases/src/schedulingtasks/payment_reminders.ts:23-29
// 🔗 EXAMPLE: Timer building blocks - restate/examples/typescript/basics/src/1_building_blocks.ts:57-59
```

---

### Q3: Failure Handling & Auto-Pause Threshold
**Add to document**:
- Recommended threshold (fixed 5? configurable? per-preset?)
- Pattern for exponential backoff implementation
- Code showing how to classify transient vs permanent failures
- UX flow for alerting users about auto-paused schedules

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Smart failure classification with configurable threshold
const FAILURE_THRESHOLDS = {
  QUICK: 3,      // Less critical, pause faster
  STANDARD: 5,   // Default
  THOROUGH: 10,  // More expensive, be more tolerant
};

async executeScan(ctx: ObjectContext) {
  try {
    await ctx.run('scan', () => invokePortScan(...));
    state.consecutiveFailures = 0;  // Reset on success
  } catch (error) {
    const errorType = classifyError(error);

    if (errorType === 'PERMANENT') {
      // Device offline, invalid IP - pause immediately
      state.isActive = false;
      await sendPostback({ type: 'SCHEDULE_AUTO_PAUSED', reason: 'permanent_failure' });
    } else {
      // Transient - track and apply backoff
      state.consecutiveFailures++;

      const threshold = FAILURE_THRESHOLDS[state.preset];
      if (state.consecutiveFailures >= threshold) {
        state.isActive = false;
        await sendPostback({
          type: 'SCHEDULE_AUTO_PAUSED',
          reason: 'consecutive_failures',
          count: state.consecutiveFailures
        });
      } else {
        // Apply exponential backoff (max 24x interval)
        const backoffMultiplier = Math.min(2 ** state.consecutiveFailures, 24);
        const nextRunAt = calculateNextRun(new Date(), state.interval, backoffMultiplier);
        // ... schedule with backoff
      }
    }
  }
}

function classifyError(error: Error): 'TRANSIENT' | 'PERMANENT' {
  // Network timeout, DNS temporary failure → TRANSIENT
  if (error.message.includes('ETIMEDOUT') || error.message.includes('ENOTFOUND')) {
    return 'TRANSIENT';
  }

  // Host unreachable, connection refused → PERMANENT
  if (error.message.includes('EHOSTUNREACH') || error.message.includes('ECONNREFUSED')) {
    return 'PERMANENT';
  }

  return 'TRANSIENT'; // Default to retrying
}

// ⚠️ EDGE CASE: What if device comes back online after auto-pause?
// UX Pattern: Show "Resume Schedule" button in UI with health check option

// 🔗 REFERENCE: Similar backoff in apps/restate-worker/src/port-scanner-service.ts (line X)
```

---

### Q4: State Persistence & Database Sync
**Add to document**:
- Source of truth decision (Restate vs DB vs hybrid)
- Pattern for atomic operations across Restate + DB
- Recovery pattern for worker restart with drift
- Code showing how to reconcile state mismatches

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Restate as runtime source of truth, DB for observability
//
// PRINCIPLE:
// - Restate state: Authoritative for execution (timers, failures, nextRunAt)
// - Database: Projection for queries, audit trail, user-facing data
// - Postbacks sync Restate → DB asynchronously (eventual consistency)

async scheduleDeviceScan(ctx: ObjectContext, input: CreateScheduleInput) {
  // 1. Create Restate state FIRST (source of truth)
  const state: ScheduleState = {
    scheduleId: input.scheduleId,
    deviceId: input.deviceId,
    organizationId: input.organizationId,
    interval: input.interval,
    preset: input.preset,
    isActive: true,
    nextRunAt: calculateNextRun(new Date(), input.interval).toISOString(),
    lastRunAt: null,
    consecutiveFailures: 0,
  };

  ctx.set('state', state);

  // 2. Schedule first timer
  ctx.objectSendDelayed('DeviceScanner', ctx.key, 'executeScan', ...);

  // 3. Asynchronously update database (fire-and-forget postback)
  // If this fails, DB is stale but Restate keeps running
  await ctx.run('sync-db', async () => {
    await sendPostback({
      type: 'SCHEDULE_CREATED',
      scheduleId: state.scheduleId,
      deviceId: state.deviceId,
      organizationId: state.organizationId,
      nextRunAt: state.nextRunAt,
    });
  });

  return { success: true, scheduleId: state.scheduleId };
}

// RECONCILIATION: Periodic sync job to detect drift
// apps/user-application/src/server/cron/reconcile-schedules.ts
export async function reconcileSchedules() {
  const dbSchedules = await getAllActiveSchedules();

  for (const dbSchedule of dbSchedules) {
    // Query Restate state
    const restateState = await restateClient
      .objectClient('DeviceScanner', dbSchedule.deviceId)
      .getScheduleState();

    if (!restateState) {
      // Schedule exists in DB but not Restate - recreate timer
      logger.warn('Schedule missing in Restate, recreating', { scheduleId: dbSchedule.id });
      await recreateScheduleInRestate(dbSchedule);
    } else if (Math.abs(new Date(restateState.nextRunAt).getTime() - dbSchedule.nextRunAt.getTime()) > 60000) {
      // Drift > 1 minute - update DB from Restate (Restate is source of truth)
      logger.info('Schedule drift detected, syncing DB', { scheduleId: dbSchedule.id });
      await updateScheduleInDB(dbSchedule.id, { nextRunAt: restateState.nextRunAt });
    }
  }
}

// ⚠️ EDGE CASE: Database write succeeds but Restate call fails during creation
// Pattern: User sees schedule in UI but it never runs
// Detection: Reconciliation job finds DB schedule with no Restate state
// Fix: Recreate timer in Restate from DB config

// 🔗 REFERENCE: Postback patterns in apps/user-application/src/server/postback/
```

---

### Q5: Interval Format & Parsing
**Add to document**:
- Final decision on format (string/ISO-8601/cron/structured)
- Parsing library recommendation (if using cron)
- Pattern for timezone-aware scheduling (if needed)
- Validation rules (min/max intervals)

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Simple string format with optional cron for advanced users
//
// RATIONALE:
// - 90% of users want simple intervals: "12h", "1d", "7d"
// - 10% power users want "daily at 2am EST" → Use cron
// - Start simple, add cron later if demanded

import { z } from 'zod';

// Schema with union type for flexibility
const ScheduleIntervalSchema = z.union([
  // Simple format (phase 1)
  z.string().regex(/^(\d+)([mhd])$/, 'Use format: 30m, 12h, 1d, 7d'),

  // Cron format (phase 2, optional)
  z.object({
    cron: z.string().regex(/^(\*|[0-9,\-*/]+)\s+...$/),  // Standard cron
    timezone: z.string().default('UTC'),
  })
]);

type ScheduleInterval = z.infer<typeof ScheduleIntervalSchema>;

function calculateNextRun(from: Date, interval: ScheduleInterval): Date {
  // Simple string format
  if (typeof interval === 'string') {
    const match = interval.match(/^(\d+)([mhd])$/);
    if (!match) throw new Error('Invalid interval');

    const value = parseInt(match[1], 10);
    const unit = match[2];

    // Validation: Min 15 minutes, max 30 days
    if (unit === 'm' && value < 15) throw new Error('Minimum interval is 15 minutes');
    if (unit === 'd' && value > 30) throw new Error('Maximum interval is 30 days');

    const next = new Date(from);
    if (unit === 'm') next.setMinutes(next.getMinutes() + value);
    if (unit === 'h') next.setHours(next.getHours() + value);
    if (unit === 'd') next.setDate(next.getDate() + value);

    return next;
  }

  // Cron format (future)
  const parser = require('cron-parser');
  const schedule = parser.parseExpression(interval.cron, {
    currentDate: from,
    tz: interval.timezone
  });
  return schedule.next().toDate();
}

// UI Helper: Human-readable labels
const INTERVAL_LABELS: Record<string, string> = {
  '30m': 'Every 30 minutes',
  '1h': 'Hourly',
  '12h': 'Every 12 hours',
  '1d': 'Daily',
  '7d': 'Weekly',
  '30d': 'Monthly',
};

// ⚠️ EDGE CASE: User in PST wants "daily at 2am PST" but server is UTC
// Phase 1: Not supported - all schedules run relative to last execution
// Phase 2: Add cron format with timezone support
// Example: { cron: "0 2 * * *", timezone: "America/Los_Angeles" }

// 🔗 LIBRARIES:
// - cron-parser: https://www.npmjs.com/package/cron-parser
// - cronstrue: https://www.npmjs.com/package/cronstrue (human-readable cron descriptions)
```

---

### Q6: Concurrency & Resource Limits
**Add to document**:
- Recommended concurrency limits (per-org, global)
- Pattern for distributed semaphore/queue in Restate
- Code showing how to acquire/release scan slots
- Strategy for staggering initial schedule start times

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Organization-level concurrency slots using Virtual Object
//
// APPROACH: Create "ScanConcurrencyManager" Virtual Object keyed by organizationId
// Holds N available slots, executeScan must acquire before running

export const scanConcurrencyManager = restate.object({
  name: 'ScanConcurrencyManager',

  handlers: {
    async initialize(ctx: ObjectContext, input: { maxSlots: number }) {
      ctx.set('maxSlots', input.maxSlots);
      ctx.set('availableSlots', input.maxSlots);
      ctx.set('queue', [] as string[]); // deviceIds waiting for slot
    },

    async acquireSlot(ctx: ObjectContext, input: { deviceId: string }): Promise<boolean> {
      const available = await ctx.get<number>('availableSlots') ?? 0;

      if (available > 0) {
        // Slot available - grant immediately
        ctx.set('availableSlots', available - 1);
        return true;
      } else {
        // No slots - add to queue (FIFO)
        const queue = await ctx.get<string[]>('queue') ?? [];
        if (!queue.includes(input.deviceId)) {
          queue.push(input.deviceId);
          ctx.set('queue', queue);
        }
        return false;
      }
    },

    async releaseSlot(ctx: ObjectContext): Promise<void> {
      const queue = await ctx.get<string[]>('queue') ?? [];

      if (queue.length > 0) {
        // Grant slot to next in queue
        const nextDeviceId = queue.shift()!;
        ctx.set('queue', queue);

        // Trigger that device's scheduled scan
        ctx.objectSendDelayed('DeviceScanner', nextDeviceId, 'executeScan', 0, {});
      } else {
        // No queue - return slot to pool
        const available = await ctx.get<number>('availableSlots') ?? 0;
        ctx.set('availableSlots', available + 1);
      }
    },
  },
});

// Usage in DeviceScanner
async executeScan(ctx: ObjectContext) {
  const state = await ctx.get<ScheduleState>('state');

  // 1. Try to acquire slot
  const manager = ctx.objectClient('ScanConcurrencyManager', state.organizationId);
  const acquired = await manager.acquireSlot({ deviceId: state.deviceId });

  if (!acquired) {
    logger.info('No available scan slots, queued', { deviceId: state.deviceId });
    return; // Will be triggered later by releaseSlot()
  }

  try {
    // 2. Run scan
    await ctx.run('scan', () => invokePortScan(...));
  } finally {
    // 3. Always release slot
    await manager.releaseSlot();
  }
}

// Configuration: Max slots per organization tier
const CONCURRENCY_LIMITS = {
  FREE: 1,       // 1 concurrent scan
  STARTER: 3,    // 3 concurrent scans
  BUSINESS: 10,  // 10 concurrent scans
  ENTERPRISE: 50, // 50 concurrent scans
};

// STAGGERING: Randomize initial delays when creating bulk schedules
async function createBulkSchedules(devices: Device[], interval: string) {
  for (let i = 0; i < devices.length; i++) {
    // Stagger by 30 seconds per device to avoid thundering herd
    const staggerDelay = i * 30 * 1000; // milliseconds

    await createSchedule(devices[i], interval, staggerDelay);
  }
}

// ⚠️ EDGE CASE: Scan takes longer than interval (2h scan, 1h interval)
// Pattern: Check lastRunAt before starting, skip if < interval elapsed
async executeScan(ctx: ObjectContext) {
  const state = await ctx.get<ScheduleState>('state');
  const now = Date.now();
  const intervalMs = parseIntervalToMs(state.interval);

  if (state.lastRunAt && (now - new Date(state.lastRunAt).getTime()) < intervalMs) {
    logger.warn('Skipping scheduled scan - previous scan still within interval', {
      deviceId: state.deviceId,
      lastRunAt: state.lastRunAt,
    });
    return;
  }

  // Proceed with scan...
}

// 🔗 REFERENCE: Similar pattern in distributed systems using Redis semaphores
// 🔗 ALTERNATIVE: Use Restate's workflow queues (if available in SDK)
```

---

### Q7: Security & Authorization
**Add to document**:
- Authorization model (RBAC, permissions matrix)
- Pattern for validating schedule quota limits
- Code showing rate limiting implementation
- Device verification status enforcement

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Permission-based authorization with quota enforcement
//
// PERMISSION MODEL:
// - 'schedules:create' - Can create new schedules
// - 'schedules:edit' - Can pause/resume/edit own schedules
// - 'schedules:edit:all' - Can edit any schedule in org (admin)
// - 'schedules:delete' - Can delete own schedules
// - 'schedules:delete:all' - Can delete any schedule (admin)

import { getCurrentUser, getCurrentOrganizationId } from '@/server/utils/auth';
import { validateProjectAccess, getDeviceById } from '@repo/data-ops';

// Server function with full validation
export const createDeviceScanSchedule = createServerFn({ method: 'POST' })
  .inputValidator(CreateScheduleSchema.parse)
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    const organizationId = await getCurrentOrganizationId();

    // 1. Check permission
    if (!user.permissions.includes('schedules:create')) {
      throw new Error('Insufficient permissions to create schedules');
    }

    // 2. Validate device access
    const device = await getDeviceById(data.deviceId, organizationId);
    if (!device) {
      throw new Error('Device not found or access denied');
    }

    // 3. Enforce device verification status (optional, configurable)
    if (device.verificationStatus !== 'VERIFIED') {
      throw new Error('Only verified devices can be scheduled for automated scans');
    }

    // 4. Check organization quota
    const existingSchedules = await getSchedulesForOrganization(organizationId);
    const org = await getOrganizationById(organizationId);
    const quota = SCHEDULE_QUOTAS[org.tier];

    if (existingSchedules.length >= quota) {
      throw new Error(`Schedule limit reached (${quota} for ${org.tier} tier)`);
    }

    // 5. Validate interval within allowed range
    const intervalMs = parseIntervalToMs(data.interval);
    const MIN_INTERVAL = 15 * 60 * 1000; // 15 minutes
    const MAX_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days

    if (intervalMs < MIN_INTERVAL) {
      throw new Error('Minimum interval is 15 minutes');
    }
    if (intervalMs > MAX_INTERVAL) {
      throw new Error('Maximum interval is 30 days');
    }

    // 6. Rate limiting (prevent abuse)
    const recentSchedules = await getSchedulesCreatedRecently(organizationId, '1h');
    if (recentSchedules.length > 10) {
      throw new Error('Rate limit exceeded: Maximum 10 schedule creations per hour');
    }

    // All validations passed - create schedule
    // ...
  });

// Quota configuration by tier
const SCHEDULE_QUOTAS: Record<OrganizationTier, number> = {
  FREE: 5,
  STARTER: 25,
  BUSINESS: 100,
  ENTERPRISE: 1000,
};

// Permission helper
export async function canManageSchedule(
  userId: string,
  scheduleId: string,
  action: 'edit' | 'delete'
): Promise<boolean> {
  const user = await getUserById(userId);
  const schedule = await getScheduleById(scheduleId);

  // Admin can manage all schedules
  if (user.permissions.includes(`schedules:${action}:all`)) {
    return true;
  }

  // User can manage own schedules
  if (schedule.createdBy === userId && user.permissions.includes(`schedules:${action}`)) {
    return true;
  }

  return false;
}

// ⚠️ EDGE CASE: User creates schedule for competitor's domain via DNS hijacking
// Mitigation: Validate device ownership, require device verification
// Additional: Log all schedule creations for audit trail

// 🔗 REFERENCE: Permission patterns in apps/user-application/src/server/utils/auth.ts
```

---

### Q8: Migration & Rollout Strategy
**Add to document**:
- Phase-by-phase rollout plan with timelines
- Feature flag implementation pattern
- Code showing how to handle existing vs new devices
- Rollback procedure with cleanup script

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Phased rollout with feature flags and opt-in
//
// PHASE 1: Beta (Week 1-2)
// - Feature flag: 'device-scheduling' enabled for specific organizations
// - Manual opt-in: Only admins can create schedules
// - Limited to 5 schedules per org
// - No auto-creation of schedules

// apps/user-application/src/server/utils/feature-flags.ts
export async function isSchedulingEnabled(organizationId: string): Promise<boolean> {
  const org = await getOrganizationById(organizationId);

  // Check Cloudflare KV or database feature flag
  const flag = await getFeatureFlag('device-scheduling');

  if (flag.enabled === 'all') return true;
  if (flag.enabled === 'none') return false;

  // Allowlist specific orgs during beta
  return flag.allowlist?.includes(organizationId) || false;
}

// Guard server functions
export const createDeviceScanSchedule = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    const organizationId = await getCurrentOrganizationId();

    if (!await isSchedulingEnabled(organizationId)) {
      throw new Error('Scheduling feature not enabled for your organization');
    }

    // ...
  });

// PHASE 2: General Availability (Week 3-4)
// - Feature flag enabled for all
// - All organization members can create schedules
// - Increased quotas by tier
// - Optional: Prompt users to enable scheduling for VERIFIED devices

// UI banner (apps/user-application/src/features/assets/components/scheduling-prompt.tsx)
export function SchedulingPrompt({ device }: { device: Device }) {
  const [dismissed, setDismissed] = useState(false);
  const hasSchedule = useHasSchedule(device.id);

  if (dismissed || hasSchedule || device.verificationStatus !== 'VERIFIED') {
    return null;
  }

  return (
    <Banner variant="info">
      <p>Would you like to schedule automated scans for {device.name}?</p>
      <Button onClick={() => openScheduleModal(device)}>Set Up Schedule</Button>
      <Button variant="ghost" onClick={() => setDismissed(true)}>Dismiss</Button>
    </Banner>
  );
}

// PHASE 3: Auto-enable for existing devices (Week 5+, optional)
// Migration script: Create default schedules for VERIFIED devices
export async function migrateExistingDevicesToScheduling() {
  const orgs = await getAllOrganizations();

  for (const org of orgs) {
    if (!await isSchedulingEnabled(org.id)) continue;

    const devices = await getDevicesForOrganization(org.id, {
      verificationStatus: 'VERIFIED',
    });

    for (const device of devices) {
      const existingSchedule = await getScheduleByDeviceId(device.id);
      if (existingSchedule) continue; // Skip if already has schedule

      // Create default schedule: Daily, STANDARD preset
      await createSchedule({
        deviceId: device.id,
        organizationId: org.id,
        interval: '1d',
        preset: 'STANDARD',
        createdBy: 'SYSTEM', // System-created
      });

      logger.info('Created default schedule for device', {
        deviceId: device.id,
        organizationId: org.id,
      });
    }
  }
}

// ROLLBACK PROCEDURE: Disable feature and cleanup timers
export async function rollbackSchedulingFeature() {
  // 1. Disable feature flag immediately
  await setFeatureFlag('device-scheduling', { enabled: 'none' });

  // 2. Pause all active schedules in database
  await pauseAllSchedules();

  // 3. Cleanup Restate timers
  const schedules = await getAllSchedules();
  for (const schedule of schedules) {
    try {
      await restateClient
        .objectClient('DeviceScanner', schedule.deviceId)
        .deleteSchedule();
    } catch (error) {
      logger.error('Failed to delete Restate schedule', { scheduleId: schedule.id, error });
    }
  }

  // 4. Archive schedules to backup table (optional)
  await archiveSchedulesToBackup();

  logger.warn('Scheduling feature rolled back', {
    totalSchedules: schedules.length,
  });
}

// ⚠️ EDGE CASE: Rollback while scans are in progress
// Pattern: Let current scans complete, don't start new ones
// Monitor: Watch for orphaned timers in Restate after rollback

// 🔗 REFERENCE: Feature flag patterns in Cloudflare Workers KV
// 🔗 CANARY ROLLOUT: Use organization tier (start with FREE tier, 5% of users)
```

---

### Q9: Testing Strategy with Time Mocking
**Add to document**:
- How to test durable timers without real delays
- Restate testing utilities and patterns
- Code showing chaos testing scenarios
- Coverage targets and CI integration

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Use Restate test SDK with time manipulation
//
// Restate provides test utilities to advance virtual time without waiting

import { describe, it, expect } from 'vitest';
import { TestDriver } from '@restatedev/restate-sdk/testdriver';
import { deviceScanner } from '../device-scanner-service';

describe('DeviceScanner Virtual Object', () => {
  it('should execute scan at scheduled time', async () => {
    const testDriver = await TestDriver.create([deviceScanner]);

    // 1. Create schedule (12h interval)
    const deviceId = 'test-device-123';
    await testDriver
      .objectClient('DeviceScanner', deviceId)
      .scheduleDeviceScan({
        scheduleId: 'sched-123',
        deviceId,
        organizationId: 'org-456',
        interval: '12h',
        preset: 'STANDARD',
        target: '192.168.1.1',
      });

    // 2. Advance virtual time by 12 hours (instant in test)
    await testDriver.advanceTime(12 * 60 * 60 * 1000);

    // 3. Verify scan executed
    const state = await testDriver
      .objectClient('DeviceScanner', deviceId)
      .getScheduleState();

    expect(state.lastRunAt).toBeDefined();
    expect(state.consecutiveFailures).toBe(0);

    // 4. Verify next scan scheduled
    await testDriver.advanceTime(12 * 60 * 60 * 1000);
    // Should trigger again...
  });

  it('should auto-pause after 5 consecutive failures', async () => {
    const testDriver = await TestDriver.create([deviceScanner]);

    // Mock PortScanner to always fail
    testDriver.mockService('PortScanner', {
      scan: async () => { throw new Error('Network timeout'); },
    });

    const deviceId = 'failing-device';
    await testDriver
      .objectClient('DeviceScanner', deviceId)
      .scheduleDeviceScan({ interval: '1h', ... });

    // Advance through 5 failures
    for (let i = 0; i < 5; i++) {
      await testDriver.advanceTime(60 * 60 * 1000); // 1 hour
    }

    const state = await testDriver
      .objectClient('DeviceScanner', deviceId)
      .getScheduleState();

    expect(state.isActive).toBe(false);
    expect(state.consecutiveFailures).toBe(5);
  });

  it('should recover from worker restart mid-execution', async () => {
    const testDriver = await TestDriver.create([deviceScanner]);

    // Start scan
    const deviceId = 'restart-device';
    await testDriver
      .objectClient('DeviceScanner', deviceId)
      .scheduleDeviceScan({ ... });

    // Simulate worker crash during scan
    await testDriver.restart();

    // State should be recovered from Restate storage
    const state = await testDriver
      .objectClient('DeviceScanner', deviceId)
      .getScheduleState();

    expect(state).toBeDefined();
    expect(state.scheduleId).toBe('sched-123');
  });
});

// CHAOS TESTING: Inject random failures
describe('Chaos Tests', () => {
  it('should handle random failures gracefully', async () => {
    const testDriver = await TestDriver.create([deviceScanner]);

    // Mock PortScanner with 30% failure rate
    testDriver.mockService('PortScanner', {
      scan: async () => {
        if (Math.random() < 0.3) {
          throw new Error('Chaos failure');
        }
        return { success: true };
      },
    });

    // Run 20 scheduled scans
    for (let i = 0; i < 20; i++) {
      await testDriver.advanceTime(60 * 60 * 1000);
    }

    // Verify schedule didn't auto-pause (failures were transient)
    const state = await testDriver
      .objectClient('DeviceScanner', 'chaos-device')
      .getScheduleState();

    expect(state.isActive).toBe(true);
    expect(state.consecutiveFailures).toBeLessThan(5);
  });
});

// INTEGRATION TEST: Full flow with real Restate (staging environment)
describe('Integration Tests', () => {
  it('should create schedule in production Restate', async () => {
    // Connect to staging Restate Cloud
    const restateClient = createRestateClient({
      url: process.env.RESTATE_STAGING_URL,
      apiKey: process.env.RESTATE_STAGING_API_KEY,
    });

    const deviceId = `test-device-${Date.now()}`;

    await restateClient
      .objectClient('DeviceScanner', deviceId)
      .scheduleDeviceScan({ ... });

    // Wait for real timer to fire (use short interval: 1 minute)
    await new Promise(resolve => setTimeout(resolve, 65 * 1000));

    // Verify scan executed in real Restate
    const state = await restateClient
      .objectClient('DeviceScanner', deviceId)
      .getScheduleState();

    expect(state.lastRunAt).toBeDefined();
  });
});

// CI CONFIGURATION: .github/workflows/test.yml
// - Unit tests: Run with TestDriver (instant)
// - Integration tests: Run nightly against staging (real timing)
// - Coverage target: 85% for Virtual Object handlers

// ⚠️ TESTING GOTCHAS:
// 1. TestDriver time is independent of system time (use driver.advanceTime())
// 2. Mock external services (PortScanner, database) to isolate Virtual Object logic
// 3. Test state persistence across restart() calls

// 🔗 RESTATE TEST DOCS: https://docs.restate.dev/develop/ts/testing
// 🔗 REFERENCE: Similar testing in apps/restate-worker/src/__tests__/
// 🔗 EXAMPLE: Timer testing patterns - restate/examples/typescript/tutorials/tour-of-workflows-typescript/src/workflows/signup-with-timers.ts:19-28
// 🔗 EXAMPLE: Awakeable timeouts - restate/examples/typescript/tutorials/tour-of-orchestration-typescript/src/timers/service.ts:20-25
```

---

### Q10: Observability & Distributed Tracing
**Add to document**:
- Metrics instrumentation pattern
- Distributed tracing setup (trace IDs across Restate → Worker → App)
- User-facing schedule health dashboard design
- Alerting rules for operational issues

**Example format**:
```typescript
// ✅ RECOMMENDED PATTERN: Distributed tracing with context propagation
//
// TRACE FLOW:
// User App → Restate Ingress → Worker → PortScanner → Postback → User App
//
// Trace ID propagates through:
// 1. Server function generates traceId
// 2. Passed to Restate in headers
// 3. Stored in Virtual Object state
// 4. Included in all logs and postbacks
// 5. Indexed in Workers Analytics Engine

import { trace, context } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

// Server function: Start trace
export const createDeviceScanSchedule = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    const traceId = uuidv4();
    const span = trace.getTracer('schedule-service').startSpan('create-schedule', {
      attributes: {
        'schedule.device_id': data.deviceId,
        'schedule.organization_id': organizationId,
        'schedule.interval': data.interval,
      },
    });

    try {
      // Pass trace context to Restate
      const result = await restateClient
        .objectClient('DeviceScanner', data.deviceId, {
          headers: { 'X-Trace-Id': traceId },
        })
        .scheduleDeviceScan({ ...data, traceId });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });

// Virtual Object: Propagate trace through execution
async executeScan(ctx: ObjectContext) {
  const state = await ctx.get<ScheduleState>('state');
  const traceId = state.traceId || uuidv4();

  logger.info('Executing scheduled scan', {
    traceId,
    deviceId: state.deviceId,
    scheduleId: state.scheduleId,
  });

  try {
    // Pass trace to PortScanner
    const scanResult = await ctx.run('scan', () =>
      invokePortScan({
        ...scanInput,
        metadata: { traceId },
      })
    );

    // Send postback with trace
    await sendPostback({
      type: 'SCHEDULED_SCAN_SUCCESS',
      traceId,
      ...
    });
  } catch (error) {
    logger.error('Scheduled scan failed', {
      traceId,
      error: error.message,
    });
  }
}

// METRICS: Instrument key operations
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('device-scheduler');

// Counters
const schedulesCreated = meter.createCounter('schedules.created');
const schedulesExecuted = meter.createCounter('schedules.executed', {
  description: 'Total scheduled scans executed',
});
const schedulesFailures = meter.createCounter('schedules.failures');
const schedulesPaused = meter.createCounter('schedules.auto_paused');

// Histograms
const scheduleDrift = meter.createHistogram('schedules.drift_ms', {
  description: 'Difference between scheduled time and actual execution time',
});
const scanDuration = meter.createHistogram('schedules.scan_duration_ms');

// Usage in executeScan
async executeScan(ctx: ObjectContext) {
  const state = await ctx.get<ScheduleState>('state');
  const scheduledTime = new Date(state.nextRunAt).getTime();
  const actualTime = Date.now();
  const drift = actualTime - scheduledTime;

  // Record drift
  scheduleDrift.record(drift, {
    'organization.id': state.organizationId,
    'schedule.preset': state.preset,
  });

  const startTime = Date.now();

  try {
    await ctx.run('scan', () => invokePortScan(...));

    schedulesExecuted.add(1, {
      'organization.id': state.organizationId,
      'result': 'success',
    });
  } catch (error) {
    schedulesFailures.add(1, {
      'organization.id': state.organizationId,
      'error.type': classifyError(error),
    });
  } finally {
    const duration = Date.now() - startTime;
    scanDuration.record(duration, {
      'schedule.preset': state.preset,
    });
  }
}

// USER-FACING DASHBOARD: Schedule health component
// apps/user-application/src/features/schedules/components/schedule-health-widget.tsx
export function ScheduleHealthWidget({ organizationId }: { organizationId: string }) {
  const { data: health } = useQuery({
    queryKey: ['schedule-health', organizationId],
    queryFn: async () => {
      // Query Workers Analytics Engine
      const result = await fetch('/api/analytics/schedule-health', {
        method: 'POST',
        body: JSON.stringify({
          organizationId,
          timeRange: '24h',
        }),
      });
      return result.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <Card>
      <CardHeader>Schedule Health (Last 24h)</CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Active Schedules" value={health.activeCount} />
          <Stat label="Success Rate" value={`${health.successRate}%`} />
          <Stat label="Auto-Paused" value={health.pausedCount} color="warning" />
        </div>

        {health.pausedCount > 0 && (
          <Alert variant="warning" className="mt-4">
            {health.pausedCount} schedules auto-paused due to failures.
            <Link to="/schedules?status=paused">Review →</Link>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ALERTING RULES: Cloudflare Workers Analytics + PagerDuty
// Query: Detect spike in auto-pause rate
SELECT
  COUNT(*) AS auto_pause_events,
  timestamp
FROM scheduled_scan_events
WHERE index1 = 'schedule_auto_paused'
  AND timestamp >= NOW() - INTERVAL '1' HOUR
GROUP BY timestamp
HAVING auto_pause_events > 10;  -- Alert if >10 auto-pauses/hour

// Integration: Send alert webhook
if (autoPauseEventsLastHour > 10) {
  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Authorization': `Token ${PAGERDUTY_TOKEN}` },
    body: JSON.stringify({
      routing_key: 'schedule-health',
      event_action: 'trigger',
      payload: {
        summary: `High schedule auto-pause rate: ${autoPauseEventsLastHour} in last hour`,
        severity: 'warning',
        source: 'device-scheduler',
      },
    }),
  });
}

// ⚠️ MONITORING GAPS TO ADDRESS:
// 1. Timer lag: Alert if scheduled_time - actual_time > 5 minutes
// 2. State drift: Reconciliation job detects DB vs Restate mismatches
// 3. Orphaned timers: Restate timers with no DB record
// 4. Resource exhaustion: Worker CPU/memory spikes during bulk schedules

// 🔗 OPENTELEMETRY SETUP: https://opentelemetry.io/docs/instrumentation/js/
// 🔗 CLOUDFLARE ANALYTICS: https://developers.cloudflare.com/analytics/analytics-engine/
// 🔗 GRAFANA DASHBOARDS: Pre-built dashboard for schedule metrics
```

---

## Summary: Please Add to Documents

For each of the 10 questions above, please:

1. ✅ **Choose the recommended approach** (A, B, C, or propose alternative)
2. 📝 **Add detailed code samples** showing the pattern in action
3. ⚠️ **Document edge cases** and how to handle them
4. 🔗 **Reference similar patterns** in our codebase or industry standards
5. 💡 **Provide implementation tips** and gotchas to avoid

## Where to Add Content

- **Primary**: Update [docs/SCHEDULE.md](./SCHEDULE.md) sections with chosen patterns
- **Secondary**: Keep [docs/SCHEDULE-REVIEW.md](./SCHEDULE-REVIEW.md) as decision log (record why we chose X over Y)

## Format Preference

- Use TypeScript code blocks with inline comments explaining the pattern
- Include `// ✅ RECOMMENDED` and `// ❌ AVOID` markers
- Add `// ⚠️ EDGE CASE:` comments for tricky scenarios
- Link to references: `// 🔗 REFERENCE: path/to/file.ts:line`

## Timeline

This is a **design review blocking implementation**. I need guidance on these patterns before writing production code.

Priority questions (if time limited):
1. **Q2 (Timer Rescheduling)** - Critical for correctness
2. **Q4 (State Sync)** - Critical for reliability
3. **Q6 (Concurrency)** - Critical for scale
4. **Q3 (Failure Handling)** - Important for UX
5. **Q10 (Observability)** - Important for operations

Thank you! 🙏
