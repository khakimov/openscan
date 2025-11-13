import { createServerFn } from '@tanstack/react-start';
import {
  getDevicesForTenant,
  getOrganizationIdFromProject,
  validateOrganizationAccess,
  validateProjectAccess,
  type DeviceQueryParams,
} from '@repo/data-ops';
import { z } from 'zod';
import { getCurrentOrganizationId, getCurrentUser } from '../utils/auth';
import { devicesLogger as logger } from './shared';
import { transformDeviceForUI, type TransformedDevice } from './transforms';
import type { DevicesListResult, DiscoveryDevicesResult } from './types';

const GetDevicesDataSchema = z.object({
  verificationStatus: z
    .union([
      z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
      z.array(z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED'])),
    ])
    .optional(),
  projectId: z.string().optional(),
});

export const getDevicesData = createServerFn({
  method: 'POST',
})
  .inputValidator(GetDevicesDataSchema.parse)
  .handler(async ({ data }): Promise<DevicesListResult> => {
    try {
      logger.info('Fetching devices from database', {
        verificationStatus: data?.verificationStatus,
        projectId: data?.projectId,
      });

      const user = await getCurrentUser();
      let organizationId: string;
      let validatedProjectId: string | undefined;

      if (data?.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(data.projectId);

        if (!derivedOrgId) {
          logger.warn('Invalid projectId provided to getDevicesData', {
            projectId: data.projectId,
            userId: user.id,
          });
          throw new Error('Project not found or access denied');
        }

        const access = await validateProjectAccess(user.id, data.projectId, derivedOrgId);

        if (!access) {
          logger.warn('Project access validation failed in getDevicesData', {
            userId: user.id,
            projectId: data.projectId,
            derivedOrgId,
          });
          throw new Error('Project not found or access denied');
        }

        organizationId = access.organization.id;
        validatedProjectId = access.project.id;

        logger.info('Validated projectId for device listing', {
          projectId: data.projectId,
          organizationId,
          userId: user.id,
        });
      } else {
        organizationId = await getCurrentOrganizationId();
        logger.info('Fetching devices for organization from session', {
          organizationId,
          verificationStatus: data?.verificationStatus,
        });
      }

      const queryParams: DeviceQueryParams = {
        page: 1,
        pageSize: 50,
        sortColumn: 'discoveredAt',
        sortDirection: 'desc',
        verificationStatus: data?.verificationStatus,
        projectId: validatedProjectId,
      };

      const devicesResponse = await getDevicesForTenant(organizationId, queryParams);

      logger.info('Successfully fetched devices from database', {
        deviceCount: devicesResponse.items.length,
        totalCount: devicesResponse.totalCount,
      });

      const transformedDevices = devicesResponse.items.map(transformDeviceForUI);

      const suspiciousIds = transformedDevices.filter((device: TransformedDevice) =>
        device.id.includes('/') || device.id.includes('?') || device.id.includes('&'),
      );
      if (suspiciousIds.length > 0) {
        logger.error('Found devices with suspicious IDs', {
          suspiciousDevices: suspiciousIds.map((device: TransformedDevice) => ({
            id: device.id,
            name: device.name,
            ip: device.ip,
          })),
        });
      }

      return {
        items: transformedDevices,
        totalCount: devicesResponse.totalCount,
        page: devicesResponse.page,
        totalPages: devicesResponse.totalPages,
      };
    } catch (error) {
      logger.error('Failed to fetch devices', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
      });

      return {
        items: [],
        totalCount: 0,
        page: 1,
        totalPages: 0,
      };
    }
  });

/**
 * Get devices from discovery for onboarding.
 * Accepts organizationId to work during onboarding before session context is established.
 */
export const getDiscoveryDevices = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { organizationId?: string }) => data)
  .handler(async ({ data }): Promise<DiscoveryDevicesResult> => {
    try {
      const user = await getCurrentUser();
      let organizationId: string;

      if (data.organizationId) {
        const orgAccess = await validateOrganizationAccess(user.id, data.organizationId);

        if (!orgAccess) {
          logger.warn('Organization access denied for getDiscoveryDevices', {
            userId: user.id,
            attemptedOrganizationId: data.organizationId,
          });
          throw new Error('Organization not found or access denied');
        }

        organizationId = orgAccess.id;
        logger.info('Fetching discovery devices with validated organization', {
          organizationId,
          userId: user.id,
          source: 'onboarding',
        });
      } else {
        organizationId = await getCurrentOrganizationId();
        logger.info('Fetching discovery devices from session', {
          organizationId,
          userId: user.id,
          source: 'session',
        });
      }

      const devicesResponse = await getDevicesForTenant(organizationId, {
        page: 1,
        pageSize: 100,
        sortColumn: 'discoveredAt',
        sortDirection: 'desc',
      });

      const discoveryDevices = devicesResponse.items.filter(
        (device: typeof devicesResponse.items[number]) => device.source !== 'ONBOARDING',
      );

      logger.info('Filtered discovery devices', {
        beforeFilter: devicesResponse.items.length,
        afterFilter: discoveryDevices.length,
        allDevices: devicesResponse.items.map((device: typeof devicesResponse.items[number]) => ({
          source: device.source,
          scope: device.scope,
          name: device.name,
        })),
      });

      logger.info('Discovery devices fetched', {
        organizationId,
        totalDevices: devicesResponse.items.length,
        discoveryDevicesCount: discoveryDevices.length,
      });

      return {
        success: true,
        devices: discoveryDevices.map((device: typeof discoveryDevices[number]) => ({
          id: device.id,
          name: device.name,
          ip: device.ip || null,
        })),
        count: discoveryDevices.length,
      };
    } catch (error) {
      logger.error('Failed to fetch discovery devices', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
      });

      return {
        success: false,
        devices: [],
        count: 0,
      };
    }
  });
