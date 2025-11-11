/**
 * Schedule Execution Postback Handler
 *
 * Handles postbacks from Restate DeviceScanner Virtual Object when scheduled scans execute.
 * Updates database with execution results, failure tracking, and next run times.
 *
 * Postback Types:
 * - SCHEDULED_SCAN_EXECUTED: Normal scan completion (success or failure)
 * - SCHEDULE_AUTO_PAUSED: Schedule auto-paused due to consecutive failures
 */

import type { PostbackHandler, HandlerResult, HandlerContext } from './base';
import type { ScheduledScanExecutedPostback, ScheduleAutoPausedPostback } from '../types';
import {
  updateScheduleRuntime,
  autoPauseScanSchedule,
} from '@repo/data-ops';
import {
  ScheduledScanExecutedPostbackSchema,
  ScheduleAutoPausedPostbackSchema,
} from '@repo/contracts/postbacks';

/**
 * Handler for SCHEDULED_SCAN_EXECUTED postbacks
 */
class ScheduledScanExecutedHandler implements PostbackHandler<ScheduledScanExecutedPostback> {
  readonly type = 'SCHEDULED_SCAN_EXECUTED';
  readonly schema = ScheduledScanExecutedPostbackSchema;

  async handle(
    payload: ScheduledScanExecutedPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { data, organizationId } = payload;

    ctx.logger.info('Processing scheduled scan execution postback', {
      scheduleId: data.scheduleId,
      organizationId,
      status: data.status,
      consecutiveFailures: data.consecutiveFailures,
    });

    try {
      // Update schedule runtime state in database
      await updateScheduleRuntime({
        scheduleId: data.scheduleId,
        organizationId,
        status: 'ACTIVE', // Keep active unless auto-paused
        lastRunAt: data.lastRunAt,
        nextRunAt: data.nextRunAt,
        consecutiveFailures: data.consecutiveFailures,
      });

      ctx.logger.info('Schedule runtime updated', {
        scheduleId: data.scheduleId,
        status: data.status,
        nextRunAt: data.nextRunAt,
        consecutiveFailures: data.consecutiveFailures,
        backoffApplied: data.backoffApplied,
      });

      // Calculate latency
      const latency = Date.now() - ctx.startTime;

      // Return analytics for successful or failed execution
      const eventType = data.status === 'SUCCESS'
        ? 'postback_scheduled_scan_success'
        : 'postback_scheduled_scan_failure';

      return {
        success: true,
        message: `Scheduled scan ${data.status.toLowerCase()} processed`,
        analytics: {
          eventType,
          blobs: [
            payload.scanId,
            data.scheduleId,
            organizationId,
          ],
          doubles: [
            latency,
            data.consecutiveFailures,
            data.backoffMs || 0,
          ],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      ctx.logger.error('Failed to process scheduled scan postback', {
        error: errorMessage,
        scheduleId: data.scheduleId,
        organizationId,
      });

      return {
        success: false,
        message: `Failed to process scheduled scan: ${errorMessage}`,
      };
    }
  }
}

/**
 * Handler for SCHEDULE_AUTO_PAUSED postbacks
 */
class ScheduleAutoPausedHandler implements PostbackHandler<ScheduleAutoPausedPostback> {
  readonly type = 'SCHEDULE_AUTO_PAUSED';
  readonly schema = ScheduleAutoPausedPostbackSchema;

  async handle(
    payload: ScheduleAutoPausedPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { data, organizationId } = payload;

    ctx.logger.warn('Processing schedule auto-pause postback', {
      scheduleId: data.scheduleId,
      organizationId,
      reason: data.reason,
      consecutiveFailures: data.consecutiveFailures,
    });

    try {
      // Auto-pause schedule in database
      await autoPauseScanSchedule({
        scheduleId: data.scheduleId,
        organizationId,
        reason: data.reason,
        consecutiveFailures: data.consecutiveFailures,
      });

      ctx.logger.info('Schedule auto-paused in database', {
        scheduleId: data.scheduleId,
        consecutiveFailures: data.consecutiveFailures,
      });

      const latency = Date.now() - ctx.startTime;

      return {
        success: true,
        message: 'Schedule auto-paused',
        analytics: {
          eventType: 'postback_schedule_auto_paused',
          blobs: [
            payload.scanId,
            data.scheduleId,
            organizationId,
          ],
          doubles: [
            latency,
            data.consecutiveFailures,
          ],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      ctx.logger.error('Failed to process auto-pause postback', {
        error: errorMessage,
        scheduleId: data.scheduleId,
        organizationId,
      });

      return {
        success: false,
        message: `Failed to process auto-pause: ${errorMessage}`,
      };
    }
  }
}

// Export handler instances for registration
export const scheduledScanExecutedHandler = new ScheduledScanExecutedHandler();
export const scheduleAutoPausedHandler = new ScheduleAutoPausedHandler();
