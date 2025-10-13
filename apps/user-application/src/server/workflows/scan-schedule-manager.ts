import { createLogger } from '@repo/logger';
import { getTemporalConnectionConfig } from '@repo/config';
import { getTemporalClient } from '../utils/temporal-client';

const logger = createLogger({ name: 'scan-schedule-manager' });

const PORTSCAN_WORKFLOW = 'portscanWorkflow';

export interface CreateScanScheduleParams {
  scheduleId: string;
  target: string;
  interval: string; // '1h', '6h', '24h', etc.
  tenantId: string;
  deviceId: string;
}

export class ScanScheduleManager {
  async createSchedule(params: CreateScanScheduleParams) {
    const client = getTemporalClient();
    const { taskQueue } = getTemporalConnectionConfig();

    try {
      await client.schedule.create({
        scheduleId: params.scheduleId,
        spec: {
          intervals: [{ every: params.interval }],
        },
        action: {
          type: 'startWorkflow',
          workflowType: PORTSCAN_WORKFLOW,
          args: [
            {
              target: params.target,
              deviceId: params.deviceId,
              tenantId: params.tenantId,
              protocol: 'tcp',
              timeout: 300000, // 5 minutes for comprehensive scan
              isExtendScan: true,
              mode: 'EXTEND',
              scanProfile: 'PS_L5',
              aggressive: true,
              additionalPortRanges: ['1-65535'], // Full TCP range
            },
          ],
          taskQueue,
        },
        policies: {
          overlap: 'SKIP', // Don't start if previous scan still running
        },
      });

      logger.info('Scan schedule created', {
        scheduleId: params.scheduleId,
        target: params.target,
        interval: params.interval,
        deviceId: params.deviceId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to create scan schedule', {
        scheduleId: params.scheduleId,
        error,
      });
      throw error;
    }
  }

  async deleteSchedule(scheduleId: string) {
    const client = getTemporalClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.delete();

      logger.info('Scan schedule deleted', { scheduleId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete scan schedule', { scheduleId, error });
      throw error;
    }
  }

  async pauseSchedule(scheduleId: string, note?: string) {
    const client = getTemporalClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.pause(note || 'Paused by user');

      logger.info('Scan schedule paused', { scheduleId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to pause scan schedule', { scheduleId, error });
      throw error;
    }
  }

  async unpauseSchedule(scheduleId: string, note?: string) {
    const client = getTemporalClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.unpause(note || 'Unpaused by user');

      logger.info('Scan schedule unpaused', { scheduleId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to unpause scan schedule', { scheduleId, error });
      throw error;
    }
  }

  async describeSchedule(scheduleId: string) {
    const client = getTemporalClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      const description = await handle.describe();

      return description;
    } catch (error) {
      logger.error('Failed to describe scan schedule', { scheduleId, error });
      throw error;
    }
  }

  async triggerScheduleNow(scheduleId: string) {
    const client = getTemporalClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.trigger();

      logger.info('Scan schedule triggered manually', { scheduleId });
      return { success: true };
    } catch (error) {
      logger.error('Failed to trigger scan schedule', { scheduleId, error });
      throw error;
    }
  }
}

export const scanScheduleManager = new ScanScheduleManager();
