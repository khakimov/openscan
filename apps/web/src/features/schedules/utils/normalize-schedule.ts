/**
 * Schedule Normalization Utilities
 *
 * Centralizes Date → ISO string conversion for scan schedules.
 * Eliminates repeated `.map(schedule => ({ ...schedule, nextRunAt: ... }))` transformations.
 *
 * Benefits:
 * - DRY: Three server handlers → one shared helper
 * - Consistency: Client always receives ISO strings
 * - Performance: Single conversion point (no repeated Date parsing in UI)
 * - Maintainability: Future schedule fields added once
 *
 * Pattern from OpenPanel:
 * https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
 */

/**
 * Schedule entity from database (has Date objects)
 */
export interface ScheduleEntity {
  id: string;
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  preset: string;
  interval: any;
  status: string;
  isActive: boolean;
  nextRunAt: Date | null;
  lastRunAt?: Date | null;
  createdAt: Date;
  updatedAt: Date | null; // Can be null in database
  createdBy?: string | null;
  [key: string]: any; // Allow additional fields
}

/**
 * Normalized schedule (client-safe with ISO strings)
 */
export interface NormalizedSchedule {
  id: string;
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  preset: string;
  interval: any;
  status: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt?: string | null;
  createdAt: string;
  updatedAt: string | null; // Can be null in database
  createdBy?: string | null;
  /** Internal flag for optimistic pending state - not persisted to server */
  _isPending?: boolean;
  [key: string]: any;
}

/**
 * Normalize single schedule: Date → ISO string
 *
 * Guards:
 * - Handles both Date objects and existing ISO strings
 * - Null-safe (nextRunAt/lastRunAt may be null)
 * - Preserves all other fields unchanged
 *
 * Usage in server:
 * ```typescript
 * const schedule = await getScanScheduleById(scheduleId, orgId);
 * return {
 *   success: true,
 *   schedule: normalizeSchedule(schedule),
 * };
 * ```
 *
 * @param schedule - Raw database schedule with Date objects
 * @returns Normalized schedule with ISO strings
 */
export function normalizeSchedule(schedule: ScheduleEntity): NormalizedSchedule {
  return {
    ...schedule,
    nextRunAt: schedule.nextRunAt
      ? schedule.nextRunAt instanceof Date
        ? schedule.nextRunAt.toISOString()
        : schedule.nextRunAt
      : null,
    lastRunAt: schedule.lastRunAt
      ? schedule.lastRunAt instanceof Date
        ? schedule.lastRunAt.toISOString()
        : schedule.lastRunAt
      : null,
    createdAt: schedule.createdAt instanceof Date
      ? schedule.createdAt.toISOString()
      : schedule.createdAt,
    updatedAt: schedule.updatedAt
      ? schedule.updatedAt instanceof Date
        ? schedule.updatedAt.toISOString()
        : schedule.updatedAt
      : null,
  };
}

/**
 * Normalize array of schedules
 *
 * Usage in server:
 * ```typescript
 * const schedules = await getSchedulesForDevice(deviceId, orgId);
 * return {
 *   success: true,
 *   schedules: normalizeScheduleList(schedules),
 * };
 * ```
 *
 * @param schedules - Array of database schedules
 * @returns Array of normalized schedules
 */
export function normalizeScheduleList(schedules: ScheduleEntity[]): NormalizedSchedule[] {
  return schedules.map(normalizeSchedule);
}
