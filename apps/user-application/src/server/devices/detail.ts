import { createServerFn } from '@tanstack/react-start';
import {
  getDeviceById,
  getDeviceTagSuggestions,
  getDeviceScanHistory,
} from '@repo/data-ops';
import { z } from 'zod';
import { getCurrentOrganizationId, getCurrentUser } from '../utils/auth';
import { devicesLogger as logger } from './shared';
import { transformDeviceForUI } from './transforms';
import type {
  DeviceDetailResult,
  DeviceVulnerabilitiesResult,
  DeviceScanHistoryResult,
} from './types';

type DeviceDetailParams = {
  deviceId: string;
};

export const getDeviceDetailData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: DeviceDetailParams) => {
    if (!data || !data.deviceId) {
      throw new Error('Device ID is required');
    }
    if (
      data.deviceId.includes('/') ||
      data.deviceId.includes('?') ||
      data.deviceId.includes('&')
    ) {
      logger.warn('Invalid deviceId format', { deviceId: data.deviceId });
      throw new Error('Invalid device ID format');
    }
    return data;
  })
  .handler(async ({ data }): Promise<DeviceDetailResult> => {
    const { deviceId } = data;
    try {
      const organizationId = await getCurrentOrganizationId();
      logger.info('Fetching device detail', { deviceId, organizationId });

      const deviceDetail = await getDeviceById(deviceId, organizationId);

      if (!deviceDetail) {
        throw new Error('Device not found');
      }

      logger.info('Successfully fetched device detail', {
        deviceId,
        deviceName: deviceDetail.name,
      });

      return transformDeviceForUI(deviceDetail);
    } catch (error) {
      logger.error('Failed to fetch device detail', { error, deviceId });
      throw error;
    }
  });

/**
 * Mock vulnerabilities until vulnerability tracking is implemented.
 */
export const getDeviceVulnerabilitiesData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: {
    deviceId: string;
    page?: number;
    sortColumn?: string;
    sortDirection?: string;
  }) => {
    if (!data || !data.deviceId) {
      throw new Error('Device ID is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<DeviceVulnerabilitiesResult> => {
    const { deviceId, page = 1 } = data;

    try {
      logger.info('Returning mock vulnerabilities for device', { deviceId });

      return {
        page: 1,
        totalPages: 1,
        totalCount: 3,
        items: [
          {
            id: 1,
            cve: 'CVE-2023-12345',
            summary: 'Remote code execution vulnerability',
            severity: 'critical',
            cvss_score: 9.8,
            state: 'discovered',
            element_id: deviceId,
          },
          {
            id: 2,
            cve: 'CVE-2023-67890',
            summary: 'Cross-site scripting vulnerability',
            severity: 'high',
            cvss_score: 7.5,
            state: 'discovered',
            element_id: deviceId,
          },
          {
            id: 3,
            cve: 'CVE-2023-11111',
            summary: 'Information disclosure vulnerability',
            severity: 'medium',
            cvss_score: 5.3,
            state: 'discovered',
            element_id: deviceId,
          },
        ],
      };
    } catch (error) {
      logger.error('Failed to fetch device vulnerabilities', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        deviceId,
        page,
      });
      throw error;
    }
  });

export const getDeviceTagSuggestionsData = createServerFn({
  method: 'GET',
})
  .inputValidator(() => ({}))
  .handler(async () => {
    try {
      const organizationId = await getCurrentOrganizationId();

      logger.info('Fetching device tag suggestions', {
        organizationId,
      });

      const tagSuggestions = await getDeviceTagSuggestions(organizationId);

      logger.info('Tag suggestions fetched successfully', {
        tagCount: tagSuggestions.length,
      });

      return tagSuggestions;
    } catch (error) {
      logger.error('Failed to fetch tag suggestions', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
      });

      return [];
    }
  });

const GetDeviceScanHistorySchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  limit: z.number().optional().default(10),
});

export const getDeviceScanHistoryData = createServerFn({ method: 'POST' })
  .inputValidator(GetDeviceScanHistorySchema.parse)
  .handler(async ({ data }): Promise<DeviceScanHistoryResult> => {
    const { deviceId, limit } = data;
    const organizationId = await getCurrentOrganizationId();

    try {
      const history = await getDeviceScanHistory(organizationId, deviceId, limit);

      logger.info('Fetched scan history', {
        deviceId,
        count: history.length,
        sample: history[0]
          ? {
              id: history[0].id,
              requestedAt: history[0].requestedAt,
              requestedAtType: typeof history[0].requestedAt,
              hasResultSummary: !!history[0].resultSummary,
              resultSummaryType: typeof history[0].resultSummary,
            }
          : null,
      });

      return { success: true, history };
    } catch (error) {
      logger.error('Failed to fetch device scan history', {
        error: error instanceof Error ? error.message : error,
        deviceId,
      });
      return { success: false, history: [] };
    }
  });
