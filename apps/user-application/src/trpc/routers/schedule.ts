import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import type { TrpcContext } from '../context';
import {
  createScanSchedule,
  getScanScheduleById,
  getSchedulesForDevice,
  getSchedulesForOrganization,
  pauseScanSchedule,
  resumeScanSchedule,
  deleteScanSchedule,
  getDeviceById,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import {
  calculateNextExecutionTime,
  resolveIntervalConfig,
  restateScheduleClient,
} from '@/server/schedules/utils';
import { normalizeSchedule, normalizeScheduleList } from '@/features/schedules/utils';

const logger = createLogger({ name: 'schedule-trpc' });

/**
 * Helper to require organizationId from protected context
 */
function requireOrganizationId(ctx: { user: NonNullable<TrpcContext['user']> }): string {
  const organizationId = ctx.user.organizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'User has no organizations. Please create an organization first.',
    });
  }
  return organizationId;
}

const CreateScheduleSchema = z.object({
  deviceId: z.string().min(1),
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
  scheduleFrequency: z.enum([
    'EVERY_30_MINUTES',
    'EVERY_HOUR',
    'EVERY_6_HOURS',
    'EVERY_12_HOURS',
    'DAILY',
  ]),
  dailyTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (must be HH:mm)')
    .optional(),
  startImmediately: z.boolean().optional().default(false),
}).refine(
  (data) => {
    if (data.scheduleFrequency === 'DAILY' && !data.dailyTime) {
      return false;
    }
    return true;
  },
  {
    message: 'dailyTime is required when scheduleFrequency is DAILY',
    path: ['dailyTime'],
  }
);

export const scheduleRouter = createTRPCRouter({
  /**
   * Get all schedules for organization
   */
  list: protectedProcedure
    .input(
      z.object({
        isActive: z.boolean().optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'AUTO_PAUSED', 'DELETED']).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        const schedules = await getSchedulesForOrganization(organizationId, {
          isActive: input?.isActive,
          status: input?.status,
        });

        logger.info('Retrieved schedules', {
          organizationId,
          count: schedules.length,
        });

        return normalizeScheduleList(schedules);
      } catch (err) {
        logger.error('Failed to fetch schedules', {
          error: err instanceof Error ? err.message : String(err),
          organizationId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch schedules',
        });
      }
    }),

  /**
   * Get schedules for a specific device
   */
  listByDevice: protectedProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        const schedules = await getSchedulesForDevice(input.deviceId, organizationId);

        logger.info('Retrieved device schedules', {
          deviceId: input.deviceId,
          organizationId,
          count: schedules.length,
        });

        return normalizeScheduleList(schedules);
      } catch (err) {
        logger.error('Failed to fetch device schedules', {
          error: err instanceof Error ? err.message : String(err),
          deviceId: input.deviceId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch device schedules',
        });
      }
    }),

  /**
   * Get schedule details by ID
   */
  detail: protectedProcedure
    .input(z.object({ scheduleId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        const schedule = await getScanScheduleById(input.scheduleId, organizationId);

        if (!schedule) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Schedule not found',
          });
        }

        // Optionally get runtime state from Restate
        let runtimeState;
        try {
          runtimeState = await restateScheduleClient.getScheduleState(input.scheduleId);
        } catch (error) {
          logger.warn('Failed to get Restate state', {
            scheduleId: input.scheduleId,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const normalized = normalizeSchedule(schedule);

        return {
          ...normalized,
          runtimeState,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;

        logger.error('Failed to get schedule', {
          error: err instanceof Error ? err.message : String(err),
          scheduleId: input.scheduleId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get schedule',
        });
      }
    }),

  /**
   * Create a new scan schedule
   */
  create: protectedProcedure
    .input(CreateScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        // Fetch device to get target
        const device = await getDeviceById(input.deviceId, organizationId);
        if (!device) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Device not found',
          });
        }

        const deviceTarget = device.ip || device.name;
        if (!deviceTarget) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Device has no IP or hostname to scan',
          });
        }

        const intervalConfig = resolveIntervalConfig(
          input.scheduleFrequency,
          input.dailyTime
        );

        logger.info('Creating scan schedule', {
          deviceId: input.deviceId,
          deviceTarget,
          preset: input.preset,
          scheduleFrequency: input.scheduleFrequency,
          intervalConfig,
          organizationId,
          userId: ctx.user.id,
        });

        // Generate schedule ID
        const scheduleId = `schedule-${input.deviceId}-${Date.now()}`;

        // Calculate next run time
        const nextRunAt = input.startImmediately
          ? new Date()
          : calculateNextExecutionTime(intervalConfig);

        // Step 1: Create in database
        const dbSchedule = await createScanSchedule({
          scheduleId,
          deviceId: input.deviceId,
          organizationId,
          interval: intervalConfig,
          preset: input.preset,
          nextRunAt,
          createdBy: ctx.user.id,
        });

        logger.info('Schedule created in database', {
          scheduleId: dbSchedule.scheduleId,
          nextRunAt: dbSchedule.nextRunAt,
        });

        // Step 2: Start Restate timer
        try {
          const restateResult = await restateScheduleClient.scheduleDeviceScan(
            scheduleId,
            {
              config: {
                scheduleId: dbSchedule.scheduleId,
                deviceId: input.deviceId,
                deviceTarget,
                organizationId,
                interval: intervalConfig,
                preset: input.preset,
                createdBy: ctx.user.id,
              },
              startImmediately: input.startImmediately,
            }
          );

          logger.info('Restate timer started', {
            scheduleId,
            nextRunAt: restateResult.nextRunAt,
          });

          return {
            success: true,
            schedule: normalizeSchedule({
              ...dbSchedule,
              nextRunAt: new Date(restateResult.nextRunAt),
            }),
          };
        } catch (restateError) {
          logger.error('Failed to start Restate timer', {
            scheduleId,
            error: restateError instanceof Error ? restateError.message : String(restateError),
          });

          // Return partial success - schedule exists in DB but timer not started
          return {
            success: false,
            error: 'Failed to start schedule timer',
            schedule: normalizeSchedule({
              ...dbSchedule,
              status: 'PAUSED',
              isActive: false,
            }),
          };
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;

        logger.error('Failed to create schedule', {
          error: err instanceof Error ? err.message : String(err),
          deviceId: input.deviceId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create schedule: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /**
   * Pause a schedule
   */
  pause: protectedProcedure
    .input(z.object({ scheduleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        logger.info('Pausing schedule', {
          scheduleId: input.scheduleId,
          organizationId,
          userId: ctx.user.id,
        });

        // Step 1: Update database
        await pauseScanSchedule(input.scheduleId, organizationId, ctx.user.id);

        // Step 2: Cancel Restate timer
        await restateScheduleClient.pauseSchedule(input.scheduleId, ctx.user.id);

        logger.info('Schedule paused', { scheduleId: input.scheduleId });

        return { success: true };
      } catch (err) {
        logger.error('Failed to pause schedule', {
          error: err instanceof Error ? err.message : String(err),
          scheduleId: input.scheduleId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to pause schedule: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /**
   * Resume a paused schedule
   */
  resume: protectedProcedure
    .input(z.object({ scheduleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        logger.info('Resuming schedule', {
          scheduleId: input.scheduleId,
          organizationId,
          userId: ctx.user.id,
        });

        // Step 1: Update database
        await resumeScanSchedule(input.scheduleId, organizationId, ctx.user.id);

        // Step 2: Restart Restate timer
        const restateResult = await restateScheduleClient.resumeSchedule(
          input.scheduleId,
          ctx.user.id
        );

        logger.info('Schedule resumed', {
          scheduleId: input.scheduleId,
          nextRunAt: restateResult.nextRunAt,
        });

        return {
          success: true,
          nextRunAt: restateResult.nextRunAt,
        };
      } catch (err) {
        logger.error('Failed to resume schedule', {
          error: err instanceof Error ? err.message : String(err),
          scheduleId: input.scheduleId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to resume schedule: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  /**
   * Delete a schedule (soft delete)
   */
  delete: protectedProcedure
    .input(z.object({ scheduleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      try {
        logger.info('Deleting schedule', {
          scheduleId: input.scheduleId,
          organizationId,
          userId: ctx.user.id,
        });

        // Step 1: Soft delete in database
        await deleteScanSchedule(input.scheduleId, organizationId, ctx.user.id);

        // Step 2: Cancel Restate timer
        await restateScheduleClient.deleteSchedule(input.scheduleId, ctx.user.id);

        logger.info('Schedule deleted', { scheduleId: input.scheduleId });

        return { success: true };
      } catch (err) {
        logger.error('Failed to delete schedule', {
          error: err instanceof Error ? err.message : String(err),
          scheduleId: input.scheduleId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete schedule: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),
});
