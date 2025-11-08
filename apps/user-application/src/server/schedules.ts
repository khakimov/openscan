/**
 * Server Functions: Scan Schedule Management
 *
 * Provides CRUD operations for device scan schedules.
 * Integrates with Restate DeviceScanner Virtual Object for durable timer management.
 *
 * Architecture:
 * - Database: Source of truth for schedule configuration (via data-ops)
 * - Restate: Runtime timer management (via HTTP client)
 * - Flow: UI → Server Function → DB + Restate
 */

import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { z } from 'zod';
import {
  createScanSchedule,
  getScanScheduleById,
  getSchedulesForDevice,
  getSchedulesForOrganization,
  pauseScanSchedule,
  resumeScanSchedule,
  deleteScanSchedule,
  getDeviceById,
  type ScheduleInterval,
  type SchedulePreset,
} from '@repo/data-ops';
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth';

const logger = createLogger({ name: 'schedules-server' });

// Restate configuration
const RESTATE_INGRESS_URL = process.env.RESTATE_INGRESS_URL || 'http://localhost:8080';
const RESTATE_API_KEY = process.env.RESTATE_API_KEY || '';

/**
 * Restate HTTP Client for DeviceScanner Virtual Object
 */
class RestateScheduleClient {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor() {
    this.baseUrl = RESTATE_INGRESS_URL;
    this.headers = {
      'Content-Type': 'application/json',
    };

    if (RESTATE_API_KEY) {
      this.headers['Authorization'] = `Bearer ${RESTATE_API_KEY}`;
    }
  }

  /**
   * Call DeviceScanner.scheduleDeviceScan handler
   */
  async scheduleDeviceScan(
    scheduleId: string,
    config: {
      scheduleId: string;
      deviceId: string;
      deviceTarget: string;
      organizationId: string;
      interval: ScheduleInterval;
      preset: SchedulePreset;
      createdBy: string;
    },
    startImmediately?: boolean
  ): Promise<{ success: true; scheduleId: string; nextRunAt: string }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/scheduleDeviceScan`;

    logger.info('Calling Restate.scheduleDeviceScan', { scheduleId, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        config,
        startImmediately,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate scheduleDeviceScan failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Call DeviceScanner.pauseSchedule handler
   */
  async pauseSchedule(
    scheduleId: string,
    pausedBy: string
  ): Promise<{ success: true }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/pauseSchedule`;

    logger.info('Calling Restate.pauseSchedule', { scheduleId, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ pausedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate pauseSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Call DeviceScanner.resumeSchedule handler
   */
  async resumeSchedule(
    scheduleId: string,
    resumedBy: string
  ): Promise<{ success: true; nextRunAt: string }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/resumeSchedule`;

    logger.info('Calling Restate.resumeSchedule', { scheduleId, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ resumedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate resumeSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Call DeviceScanner.deleteSchedule handler
   */
  async deleteSchedule(
    scheduleId: string,
    deletedBy: string
  ): Promise<{ success: true }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/deleteSchedule`;

    logger.info('Calling Restate.deleteSchedule', { scheduleId, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ deletedBy }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate deleteSchedule failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Call DeviceScanner.getScheduleState handler (shared, non-locking)
   */
  async getScheduleState(scheduleId: string): Promise<{
    scheduleId: string;
    status: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
    nextExecutionTime?: string;
    consecutiveFailures: number;
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    lastRunAt?: string;
    currentLeaseId?: string;
  }> {
    const url = `${this.baseUrl}/DeviceScanner/${scheduleId}/getScheduleState`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Restate getScheduleState failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}

// Singleton client instance
const restateClient = new RestateScheduleClient();

// Validation schemas
const CreateScheduleSchema = z.object({
  deviceId: z.string().min(1),
  interval: z.string().min(1), // Cron expression from UI
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
  startImmediately: z.boolean().optional().default(false),
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;

const ScheduleActionSchema = z.object({
  scheduleId: z.string().min(1),
});

/**
 * Create a new scan schedule
 *
 * 1. Creates schedule in database (source of truth)
 * 2. Calls Restate to start durable timer
 */
export const createScheduleData = createServerFn({
  method: 'POST',
})
  .inputValidator(CreateScheduleSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      // Fetch device to get target (IP or hostname)
      const device = await getDeviceById(data.deviceId, organizationId);
      if (!device) {
        throw new Error('Device not found');
      }

      const deviceTarget = device.ip || device.name;
      if (!deviceTarget) {
        throw new Error('Device has no IP or hostname to scan');
      }

      logger.info('Creating scan schedule', {
        deviceId: data.deviceId,
        deviceTarget,
        preset: data.preset,
        interval: data.interval,
        organizationId,
        userId: user.id,
      });

      // Generate schedule ID
      const scheduleId = `schedule-${data.deviceId}-${Date.now()}`;

      // Parse interval as cron expression (coming from UI)
      const cronInterval = data.interval;

      // Calculate next run time from cron
      const nextRunAt = data.startImmediately
        ? new Date()
        : new Date(Date.now() + 60000); // TODO: Parse cron for accurate next run

      // Step 1: Create in database
      const dbSchedule = await createScanSchedule({
        scheduleId,
        deviceId: data.deviceId,
        organizationId,
        interval: cronInterval,
        preset: data.preset,
        nextRunAt,
        createdBy: user.id,
      });

      logger.info('Schedule created in database', {
        scheduleId: dbSchedule.scheduleId,
        nextRunAt: dbSchedule.nextRunAt,
      });

      // Step 2: Start Restate timer
      try {
        const restateResult = await restateClient.scheduleDeviceScan(
          scheduleId,
          {
            scheduleId: dbSchedule.scheduleId,
            deviceId: data.deviceId,
            deviceTarget,
            organizationId,
            interval: { kind: 'duration', value: 30, unit: 'minutes' } as ScheduleInterval, // TODO: Parse cron to interval
            preset: data.preset,
            createdBy: user.id,
          },
          data.startImmediately
        );

        logger.info('Restate timer started', {
          scheduleId,
          nextRunAt: restateResult.nextRunAt,
        });

        return {
          success: true,
          schedule: {
            id: dbSchedule.id,
            scheduleId: dbSchedule.scheduleId,
            deviceId: dbSchedule.deviceId,
            preset: dbSchedule.preset,
            interval: dbSchedule.interval,
            nextRunAt: restateResult.nextRunAt,
            status: dbSchedule.status,
            isActive: dbSchedule.isActive,
          },
        };
      } catch (restateError) {
        logger.error('Failed to start Restate timer', {
          scheduleId,
          error: restateError instanceof Error ? restateError.message : String(restateError),
        });

        // TODO: Consider rolling back database creation
        // For now, return partial success - schedule exists in DB but timer not started
        return {
          success: false,
          error: 'Failed to start schedule timer',
          schedule: {
            id: dbSchedule.id,
            scheduleId: dbSchedule.scheduleId,
            deviceId: dbSchedule.deviceId,
            preset: dbSchedule.preset,
            interval: dbSchedule.interval,
            nextRunAt: dbSchedule.nextRunAt?.toISOString() || null,
            status: 'PAUSED', // Mark as paused since timer failed
            isActive: false,
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create schedule', {
        error: errorMessage,
        deviceId: data.deviceId,
      });

      throw new Error(`Failed to create schedule: ${errorMessage}`);
    }
  });

/**
 * Pause a schedule
 *
 * 1. Updates database
 * 2. Cancels Restate timer
 */
export const pauseScheduleData = createServerFn({
  method: 'POST',
})
  .inputValidator(ScheduleActionSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Pausing schedule', {
        scheduleId: data.scheduleId,
        organizationId,
        userId: user.id,
      });

      // Step 1: Update database
      await pauseScanSchedule(data.scheduleId, organizationId, user.id);

      // Step 2: Cancel Restate timer
      await restateClient.pauseSchedule(data.scheduleId, user.id);

      logger.info('Schedule paused', { scheduleId: data.scheduleId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to pause schedule', {
        error: errorMessage,
        scheduleId: data.scheduleId,
      });

      throw new Error(`Failed to pause schedule: ${errorMessage}`);
    }
  });

/**
 * Resume a paused schedule
 *
 * 1. Updates database
 * 2. Restarts Restate timer
 */
export const resumeScheduleData = createServerFn({
  method: 'POST',
})
  .inputValidator(ScheduleActionSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Resuming schedule', {
        scheduleId: data.scheduleId,
        organizationId,
        userId: user.id,
      });

      // Step 1: Update database
      await resumeScanSchedule(data.scheduleId, organizationId, user.id);

      // Step 2: Restart Restate timer
      const restateResult = await restateClient.resumeSchedule(data.scheduleId, user.id);

      logger.info('Schedule resumed', {
        scheduleId: data.scheduleId,
        nextRunAt: restateResult.nextRunAt,
      });

      return {
        success: true,
        nextRunAt: restateResult.nextRunAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to resume schedule', {
        error: errorMessage,
        scheduleId: data.scheduleId,
      });

      throw new Error(`Failed to resume schedule: ${errorMessage}`);
    }
  });

/**
 * Delete a schedule (soft delete)
 *
 * 1. Marks as deleted in database
 * 2. Cancels Restate timer
 */
export const deleteScheduleData = createServerFn({
  method: 'POST',
})
  .inputValidator(ScheduleActionSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Deleting schedule', {
        scheduleId: data.scheduleId,
        organizationId,
        userId: user.id,
      });

      // Step 1: Soft delete in database
      await deleteScanSchedule(data.scheduleId, organizationId, user.id);

      // Step 2: Cancel Restate timer
      await restateClient.deleteSchedule(data.scheduleId, user.id);

      logger.info('Schedule deleted', { scheduleId: data.scheduleId });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete schedule', {
        error: errorMessage,
        scheduleId: data.scheduleId,
      });

      throw new Error(`Failed to delete schedule: ${errorMessage}`);
    }
  });

/**
 * Get schedule details
 */
export const getScheduleData = createServerFn({
  method: 'POST',
})
  .inputValidator(ScheduleActionSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      const schedule = await getScanScheduleById(data.scheduleId, organizationId);

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      // Optionally get runtime state from Restate
      let runtimeState;
      try {
        runtimeState = await restateClient.getScheduleState(data.scheduleId);
      } catch (error) {
        logger.warn('Failed to get Restate state', {
          scheduleId: data.scheduleId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without runtime state
      }

      return {
        success: true,
        schedule: {
          ...schedule,
          runtimeState,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get schedule', {
        error: errorMessage,
        scheduleId: data.scheduleId,
      });

      throw new Error(`Failed to get schedule: ${errorMessage}`);
    }
  });

/**
 * Get schedules for a device
 */
const GetSchedulesForDeviceSchema = z.object({
  deviceId: z.string().min(1),
});

export const getSchedulesForDeviceData = createServerFn({
  method: 'POST',
})
  .inputValidator(GetSchedulesForDeviceSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      const schedules = await getSchedulesForDevice(data.deviceId, organizationId);

      return {
        success: true,
        schedules,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get device schedules', {
        error: errorMessage,
        deviceId: data.deviceId,
      });

      return {
        success: false,
        schedules: [],
      };
    }
  });

/**
 * Get all schedules for organization
 */
const GetSchedulesSchema = z.object({
  isActive: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'AUTO_PAUSED', 'DELETED']).optional(),
});

export const getSchedulesData = createServerFn({
  method: 'POST',
})
  .inputValidator(GetSchedulesSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      const schedules = await getSchedulesForOrganization(organizationId, {
        isActive: data.isActive,
        status: data.status,
      });

      return {
        success: true,
        schedules,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get schedules', { error: errorMessage });

      return {
        success: false,
        schedules: [],
      };
    }
  });

/**
 * Helper: Calculate next execution time based on interval config
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
 * Helper: Convert duration to milliseconds
 */
function convertToMilliseconds(value: number, unit: 'minutes' | 'hours' | 'days'): number {
  const multipliers = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}
