import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { getCurrentOrganizationId } from '../../utils/auth';
import { deviceManager } from '../services/device-manager';
import { extractErrorMessage } from '../utils/workflow-helpers';

const logger = createLogger({ name: 'discovery-device-scan-handler' });

export const getActiveDeviceScans = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string }) => {
    if (!data?.deviceId) {
      throw new Error('Device ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { deviceId } = data;

    try {
      const organizationId = await getCurrentOrganizationId();
      const activeScans = await deviceManager.fetchActiveScans(organizationId, deviceId);

      logger.info('Retrieved active scans for device', {
        deviceId,
        organizationId,
        activeScansCount: activeScans.length,
      });

      const workflowIds = activeScans.map((scan) => scan.workflow.workflowId);

      return {
        success: true,
        activeScans: workflowIds,
        count: activeScans.length,
      };
    } catch (error) {
      const message = extractErrorMessage(error);
      logger.error('Failed to get active device scans', { deviceId, error: message });
      return {
        success: false,
        error: message,
        activeScans: [],
        count: 0,
      };
    }
  });
