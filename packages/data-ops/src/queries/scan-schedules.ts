import { eq, and, desc, lte, count } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { scanSchedules, scanScheduleEvents, scanScheduleLeases } from '../schema/orchestration';
import { createId } from '@paralleldrive/cuid2';

/**
 * Schedule interval types
 */
export type DurationInterval = {
  kind: 'duration';
  value: number;
  unit: 'minutes' | 'hours' | 'days';
};

export type DailyInterval = {
  kind: 'daily';
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string;
};

export type ScheduleInterval = DurationInterval | DailyInterval;

export type SchedulePreset = 'QUICK' | 'STANDARD' | 'THOROUGH';

export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';

/**
 * Create a new scan schedule
 * Uses ON CONFLICT DO UPDATE for idempotency (Restate retries)
 */
export async function createScanSchedule(input: {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  interval: ScheduleInterval;
  preset: SchedulePreset;
  nextRunAt: Date;
  createdBy: string;
}): Promise<typeof scanSchedules.$inferSelect> {
  const db = getDb();

  const intervalLabel = formatIntervalLabel(input.interval);

  const [schedule] = await db
    .insert(scanSchedules)
    .values({
      id: createId(),
      scheduleId: input.scheduleId,
      deviceId: input.deviceId,
      organizationId: input.organizationId,
      intervalConfig: input.interval,
      interval: intervalLabel,
      preset: input.preset,
      nextRunAt: input.nextRunAt,
      status: 'ACTIVE',
      isActive: true,
      consecutiveFailures: 0,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: scanSchedules.scheduleId,
      set: {
        deviceId: input.deviceId,
        organizationId: input.organizationId,
        intervalConfig: input.interval,
        interval: intervalLabel,
        preset: input.preset,
        nextRunAt: input.nextRunAt,
        status: 'ACTIVE',
        isActive: true,
        consecutiveFailures: 0,
        updatedAt: new Date(),
      },
    })
    .returning();

  // Record event
  await recordScheduleEvent({
    scheduleId: input.scheduleId,
    organizationId: input.organizationId,
    type: 'CREATED',
    performedBy: input.createdBy,
    metadata: {
      interval: input.interval,
      preset: input.preset,
    },
  });

  return schedule;
}

/**
 * Get schedule by scheduleId
 */
export async function getScanScheduleById(
  scheduleId: string,
  organizationId: string
): Promise<typeof scanSchedules.$inferSelect | null> {
  const db = getDb();

  const [schedule] = await db
    .select()
    .from(scanSchedules)
    .where(
      and(
        eq(scanSchedules.scheduleId, scheduleId),
        eq(scanSchedules.organizationId, organizationId)
      )
    )
    .limit(1);

  return schedule || null;
}

/**
 * Get schedules for a specific device (excludes DELETED schedules)
 */
export async function getSchedulesForDevice(
  deviceId: string,
  organizationId: string
): Promise<Array<typeof scanSchedules.$inferSelect>> {
  const db = getDb();

  const schedules = await db
    .select()
    .from(scanSchedules)
    .where(
      and(
        eq(scanSchedules.deviceId, deviceId),
        eq(scanSchedules.organizationId, organizationId),
        eq(scanSchedules.isActive, true)
      )
    )
    .orderBy(desc(scanSchedules.createdAt));

  return schedules;
}

/**
 * Get all schedules for an organization
 */
export async function getSchedulesForOrganization(
  organizationId: string,
  filters?: {
    isActive?: boolean;
    status?: ScheduleStatus;
  }
): Promise<Array<typeof scanSchedules.$inferSelect>> {
  const db = getDb();

  const conditions = [eq(scanSchedules.organizationId, organizationId)];

  if (filters?.isActive !== undefined) {
    conditions.push(eq(scanSchedules.isActive, filters.isActive));
  }

  if (filters?.status) {
    conditions.push(eq(scanSchedules.status, filters.status));
  }

  const schedules = await db
    .select()
    .from(scanSchedules)
    .where(and(...conditions))
    .orderBy(desc(scanSchedules.createdAt));

  return schedules;
}

/**
 * Update schedule runtime fields (called from Restate after scan execution)
 */
export async function updateScheduleRuntime(input: {
  scheduleId: string;
  organizationId: string;
  status: ScheduleStatus;
  lastRunAt: string | null;
  nextRunAt: string;
  consecutiveFailures: number;
}): Promise<void> {
  const db = getDb();

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
        eq(scanSchedules.organizationId, input.organizationId)
      )
    );
}

/**
 * Pause a schedule (manual action by user)
 */
export async function pauseScanSchedule(
  scheduleId: string,
  organizationId: string,
  pausedBy: string
): Promise<void> {
  const db = getDb();

  await db
    .update(scanSchedules)
    .set({
      status: 'PAUSED',
      isActive: false,
      pausedAt: new Date(),
      pausedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scanSchedules.scheduleId, scheduleId),
        eq(scanSchedules.organizationId, organizationId)
      )
    );

  await recordScheduleEvent({
    scheduleId,
    organizationId,
    type: 'PAUSED',
    performedBy: pausedBy,
  });
}

/**
 * Resume a paused schedule
 */
export async function resumeScanSchedule(
  scheduleId: string,
  organizationId: string,
  resumedBy: string
): Promise<void> {
  const db = getDb();

  await db
    .update(scanSchedules)
    .set({
      status: 'ACTIVE',
      isActive: true,
      consecutiveFailures: 0, // Reset failures on resume
      pausedAt: null,
      pausedBy: null,
      pausedReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scanSchedules.scheduleId, scheduleId),
        eq(scanSchedules.organizationId, organizationId)
      )
    );

  await recordScheduleEvent({
    scheduleId,
    organizationId,
    type: 'RESUMED',
    performedBy: resumedBy,
  });
}

/**
 * Auto-pause a schedule (triggered by failure threshold or permanent error)
 */
export async function autoPauseScanSchedule(input: {
  scheduleId: string;
  organizationId: string;
  reason: string;
  consecutiveFailures?: number;
}): Promise<void> {
  const db = getDb();

  const updates: any = {
    status: 'AUTO_PAUSED',
    isActive: false,
    pausedAt: new Date(),
    pausedReason: input.reason,
    updatedAt: new Date(),
  };

  if (typeof input.consecutiveFailures === 'number') {
    updates.consecutiveFailures = input.consecutiveFailures;
  }

  await db
    .update(scanSchedules)
    .set(updates)
    .where(
      and(
        eq(scanSchedules.scheduleId, input.scheduleId),
        eq(scanSchedules.organizationId, input.organizationId)
      )
    );

  await recordScheduleEvent({
    scheduleId: input.scheduleId,
    organizationId: input.organizationId,
    type: 'AUTO_PAUSED',
    performedBy: null, // System event
    metadata: {
      reason: input.reason,
      consecutiveFailures: input.consecutiveFailures,
    },
  });
}

/**
 * Delete a schedule (soft delete - marks as DELETED)
 */
export async function deleteScanSchedule(
  scheduleId: string,
  organizationId: string,
  deletedBy: string
): Promise<void> {
  const db = getDb();

  await db
    .update(scanSchedules)
    .set({
      status: 'DELETED',
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scanSchedules.scheduleId, scheduleId),
        eq(scanSchedules.organizationId, organizationId)
      )
    );

  await recordScheduleEvent({
    scheduleId,
    organizationId,
    type: 'DELETED',
    performedBy: deletedBy,
  });
}

/**
 * Get schedules due to run (for reconciliation job)
 */
export async function getSchedulesDueToRun(
  beforeTimestamp: Date = new Date()
): Promise<Array<typeof scanSchedules.$inferSelect>> {
  const db = getDb();

  const schedules = await db
    .select()
    .from(scanSchedules)
    .where(
      and(
        eq(scanSchedules.isActive, true),
        eq(scanSchedules.status, 'ACTIVE'),
        lte(scanSchedules.nextRunAt, beforeTimestamp)
      )
    )
    .orderBy(scanSchedules.nextRunAt);

  return schedules;
}

/**
 * Record a schedule event for audit trail
 */
async function recordScheduleEvent(input: {
  scheduleId: string;
  organizationId: string;
  type: 'CREATED' | 'PAUSED' | 'RESUMED' | 'AUTO_PAUSED' | 'DELETED' | 'UPDATED';
  performedBy: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  const db = getDb();

  await db.insert(scanScheduleEvents).values({
    id: createId(),
    scheduleId: input.scheduleId,
    organizationId: input.organizationId,
    type: input.type,
    performedBy: input.performedBy,
    metadata: input.metadata || {},
  });
}

/**
 * Get schedule events (audit trail)
 */
export async function getScheduleEvents(
  scheduleId: string,
  organizationId: string
): Promise<Array<typeof scanScheduleEvents.$inferSelect>> {
  const db = getDb();

  const events = await db
    .select()
    .from(scanScheduleEvents)
    .where(
      and(
        eq(scanScheduleEvents.scheduleId, scheduleId),
        eq(scanScheduleEvents.organizationId, organizationId)
      )
    )
    .orderBy(desc(scanScheduleEvents.createdAt));

  return events;
}

/**
 * Helper: Format interval as human-readable label
 */
function formatIntervalLabel(interval: ScheduleInterval): string {
  if (interval.kind === 'duration') {
    const unitLabel =
      interval.unit === 'minutes'
        ? interval.value === 1
          ? 'minute'
          : 'minutes'
        : interval.unit === 'hours'
        ? interval.value === 1
          ? 'hour'
          : 'hours'
        : interval.value === 1
        ? 'day'
        : 'days';
    return `Every ${interval.value} ${unitLabel}`;
  }

  const hour = interval.hour.toString().padStart(2, '0');
  const minute = interval.minute.toString().padStart(2, '0');
  return `Daily at ${hour}:${minute} ${interval.timezone}`;
}
