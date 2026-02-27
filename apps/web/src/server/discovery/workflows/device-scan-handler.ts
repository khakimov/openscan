import { createLogger } from '@repo/logger';

import { deviceManager } from '../services/device-manager';
import { extractErrorMessage } from '../utils/workflow-helpers';
import type { DeviceScanListResult } from './types';

const logger = createLogger({ name: 'discovery-device-scan-handler' });

export async function getActiveDeviceScans({
  data,
}: {
  data: { deviceId: string; organizationId: string };
}): Promise<DeviceScanListResult> {
  const { deviceId, organizationId } = data;

  try {
    const activeScans = await deviceManager.fetchActiveScans(
      organizationId,
      deviceId
    );

    logger.info('Retrieved active scans for device', {
      deviceId,
      organizationId,
      activeScansCount: activeScans.length,
    });

    const scanIds = activeScans.map(
      (scan) => scan.scanRun.restateWorkflowId
    );

    return {
      success: true,
      activeScans: scanIds,
      count: activeScans.length,
    };
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.error('Failed to get active device scans', {
      deviceId,
      error: message,
    });
    return {
      success: false,
      error: message,
      activeScans: [],
      count: 0,
    };
  }
}
