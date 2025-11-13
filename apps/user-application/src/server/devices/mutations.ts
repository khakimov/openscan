import { createServerFn } from '@tanstack/react-start';
import {
  deleteDevice as deleteDeviceDB,
  createMultipleDevicesFromDiscovery,
  updateDevice,
  getDeviceById,
  verifyDevice as verifyDeviceDB,
  unverifyDevice as unverifyDeviceDB,
  getOrganizationIdFromProject,
  validateProjectAccess,
  type DeviceUpdateData,
} from '@repo/data-ops';
import { z } from 'zod';
import { getCurrentOrganizationId, getCurrentUser } from '../utils/auth';
import { formatServerError } from '../utils/errors';
import { devicesLogger as logger } from './shared';
import { transformDeviceForUI } from './transforms';
import type {
  DeleteDeviceResult,
  CreateDevicesResult,
  UpdateDeviceResult,
  VerifyDeviceResult,
  ToggleDeviceVerificationResult,
  StartDeviceScanResult,
} from './types';
import {
  buildScanInputFromPreset,
  type ScanPresetType,
  getScanPresetDescription,
} from './scan-presets';
import { startPortScanWorkflow } from '../discovery';

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const UpdateDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  updates: z.object({
    name: z.string().min(1, 'Device name is required').max(255).optional(),
    ip: z.string().regex(IP_REGEX, 'Invalid IP address').optional().or(z.literal('')),
    riskLevel: z.enum(['SECURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    state: z.string().optional(),
    scope: z.enum(['INTERNAL', 'EXTERNAL', 'HYBRID']).optional(),
    source: z.string().optional(),
    isScanned: z.boolean().optional(),
    respondsToPing: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
  }),
});

export const deleteDevice = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string }) => {
    logger.info('deleteDevice input validation', {
      data,
      deviceId: data?.deviceId,
      deviceIdType: typeof data?.deviceId,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : null,
    });

    if (!data?.deviceId || typeof data.deviceId !== 'string') {
      throw new Error(
        `Device ID is required and must be a string, received: ${JSON.stringify(data)}`,
      );
    }
    return data;
  })
  .handler(async ({ data }): Promise<DeleteDeviceResult> => {
    const { deviceId } = data;

    try {
      const organizationId = await getCurrentOrganizationId();
      logger.info('Deleting device', { deviceId, organizationId });

      try {
        const existingDevice = await getDeviceById(deviceId, organizationId);
        logger.info('Device lookup result', {
          deviceId,
          organizationId,
          found: !!existingDevice,
          deviceName: existingDevice?.name,
        });

        if (!existingDevice) {
          throw new Error('Device not found or access denied');
        }
      } catch (lookupError) {
        logger.error('Device lookup failed', {
          deviceId,
          organizationId,
          lookupError: formatServerError(lookupError),
        });
        throw new Error('Device not found or access denied');
      }

      const deleted = await deleteDeviceDB(deviceId, organizationId);

      if (!deleted) {
        logger.error('Delete operation returned false', { deviceId, organizationId });
        throw new Error('Device not found or access denied');
      }

      logger.info('Device deleted successfully', { deviceId });

      return {
        success: true,
        message: `Device ${deviceId} deleted successfully`,
      };
    } catch (error) {
      logger.error('Failed to delete device', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        deviceId,
      });

      throw error;
    }
  });

export const createDevicesFromDiscovery = createServerFn({
  method: 'POST',
})
  .inputValidator((data: {
    targets: Array<{ host: string; ip?: string }>;
    projectId?: string;
    options?: {
      source?: string;
      scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
      verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
    };
  }) => {
    logger.info('createDevicesFromDiscovery input validation', {
      data,
      targetsLength: data?.targets?.length,
      dataType: typeof data,
      projectId: data?.projectId,
      options: data?.options,
    });

    if (!data?.targets?.length) {
      logger.error('No targets provided for device creation', { data });
      throw new Error('At least one target is required');
    }

    for (const target of data.targets) {
      if (!target.host?.trim()) {
        logger.error('Invalid target provided', { target });
        throw new Error('All targets must have a valid hostname');
      }
    }

    logger.info('Input validation passed', {
      targetCount: data.targets.length,
      targets: data.targets.map((target) => ({ host: target.host, hasIp: !!target.ip })),
      projectId: data.projectId,
      options: data.options,
    });

    return data;
  })
  .handler(async ({ data }): Promise<CreateDevicesResult> => {
    try {
      const user = await getCurrentUser();

      logger.info('Starting createDevicesFromDiscovery handler', {
        targetCount: data.targets.length,
        projectId: data.projectId,
        options: data.options,
        userId: user.id,
      });

      let organizationId: string;
      let validatedProjectId: string | null = data.projectId ?? null;

      if (data.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(data.projectId);

        if (!derivedOrgId) {
          throw new Error('Project not found or access denied');
        }

        const access = await validateProjectAccess(user.id, data.projectId, derivedOrgId);

        if (!access) {
          logger.warn('Project access validation failed for device discovery', {
            userId: user.id,
            projectId: data.projectId,
            derivedOrgId,
          });
          throw new Error('Project not found or access denied');
        }

        organizationId = access.organization.id;
        validatedProjectId = access.project.id;

        logger.info('Derived organizationId from projectId', {
          projectId: data.projectId,
          organizationId,
          userId: user.id,
        });
      } else {
        organizationId = await getCurrentOrganizationId();
        validatedProjectId = null;

        logger.info('Using organizationId from session', {
          organizationId,
          userId: user.id,
        });
      }

      logger.info('Creating devices from discovery', {
        organizationId,
        projectId: validatedProjectId,
        targetCount: data.targets.length,
        targets: data.targets,
        options: data.options,
        source: data.projectId ? 'with-project' : 'session-default',
      });

      const createdDevices = await createMultipleDevicesFromDiscovery(data.targets, organizationId, {
        ...data.options,
        projectId: validatedProjectId,
      });

      logger.info('Successfully created devices from discovery', {
        organizationId,
        createdCount: createdDevices.length,
        deviceIds: createdDevices.map((device) => device.id),
      });

      const response: CreateDevicesResult = {
        success: true,
        devices: createdDevices.map(transformDeviceForUI),
        count: createdDevices.length,
      };

      logger.info('Returning successful response', {
        responseCount: response.count,
        hasDevices: response.devices.length > 0,
      });

      return response;
    } catch (error) {
      logger.error('Failed to create devices from discovery', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        targetCount: data.targets.length,
        targets: data.targets,
      });

      throw error;
    }
  });

export const updateDeviceData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string; updates: DeviceUpdateData }) =>
    UpdateDeviceSchema.parse(data),
  )
  .handler(async ({ data }): Promise<UpdateDeviceResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();

      logger.info('Updating device', {
        deviceId: data.deviceId,
        organizationId,
        updateFields: Object.keys(data.updates),
      });

      const updatedDevice = await updateDevice(data.deviceId, data.updates, organizationId);

      if (!updatedDevice) {
        throw new Error('Device not found or update failed');
      }

      logger.info('Device updated successfully', {
        deviceId: updatedDevice.id,
        name: updatedDevice.name,
      });

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice),
      };
    } catch (error) {
      logger.error('Failed to update device', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        deviceId: data.deviceId,
      });

      throw error;
    }
  });

const VerifyDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  status: z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
  note: z.string().max(500).optional(),
});

export const verifyDevice = createServerFn({
  method: 'POST',
})
  .inputValidator(VerifyDeviceSchema.parse)
  .handler(async ({ data }): Promise<VerifyDeviceResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const currentUser = await getCurrentUser();

      logger.info('Verifying device', {
        deviceId: data.deviceId,
        status: data.status,
        userId: currentUser.id,
        organizationId,
      });

      const currentDevice = await getDeviceById(data.deviceId, organizationId);
      if (!currentDevice) {
        throw new Error('Device not found');
      }

      const updatedDevice = await updateDevice(
        data.deviceId,
        {
          verificationStatus: data.status,
          verifiedAt: new Date(),
          verifiedBy: currentUser.id,
          verificationNote: data.note || null,
        },
        organizationId,
      );

      logger.info('Device verification changed', {
        event: 'verification.change',
        deviceId: data.deviceId,
        deviceName: currentDevice.name,
        oldStatus: currentDevice.verificationStatus,
        newStatus: data.status,
        verifiedBy: currentUser.id,
        verifiedByEmail: currentUser.email,
        note: data.note,
        organizationId,
      });

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice),
      };
    } catch (error) {
      logger.error('Failed to verify device', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        deviceId: data.deviceId,
      });

      throw new Error('Failed to update device verification status');
    }
  });

const ToggleDeviceVerificationSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  verify: z.boolean(),
  interval: z.string().optional().default('1h'),
  note: z.string().max(500).optional(),
});

export const toggleDeviceVerification = createServerFn({
  method: 'POST',
})
  .inputValidator(ToggleDeviceVerificationSchema.parse)
  .handler(async ({ data }): Promise<ToggleDeviceVerificationResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const currentUser = await getCurrentUser();

      logger.info('Toggling device verification', {
        deviceId: data.deviceId,
        verify: data.verify,
        interval: data.interval,
        userId: currentUser.id,
        organizationId,
      });

      const device = await getDeviceById(data.deviceId, organizationId);
      if (!device) {
        throw new Error('Device not found');
      }

      if (data.verify) {
        await verifyDeviceDB(data.deviceId, organizationId, currentUser.id, data.note);

        logger.info('Device verified (scheduling not yet implemented)', {
          deviceId: device.id,
          interval: data.interval,
        });

        return {
          success: true,
          verified: true,
          message: 'Device verified successfully',
        };
      }

      await unverifyDeviceDB(data.deviceId, organizationId);

      logger.info('Device unverified', {
        deviceId: device.id,
      });

      return {
        success: true,
        verified: false,
        message: 'Device unverified successfully',
      };
    } catch (error) {
      logger.error('Failed to toggle device verification', {
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : error,
        deviceId: data.deviceId,
        verify: data.verify,
      });

      throw new Error('Failed to toggle device verification');
    }
  });

const StartDeviceScanSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  target: z.string().min(1, 'Target is required'),
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
});

export const startDeviceScan = createServerFn({
  method: 'POST',
})
  .inputValidator(StartDeviceScanSchema.parse)
  .handler(async ({ data }): Promise<StartDeviceScanResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Starting device scan with preset', {
        deviceId: data.deviceId,
        target: data.target,
        preset: data.preset,
        organizationId,
        userId: user.id,
      });

      const scanInput = buildScanInputFromPreset(
        data.preset as ScanPresetType,
        data.target,
        data.deviceId,
      );

      const result = await startPortScanWorkflow({ data: scanInput });

      if (result.success) {
        logger.info('Device scan started successfully', {
          deviceId: data.deviceId,
          target: data.target,
          preset: data.preset,
          scanId: result.scanId,
        });
      }

      return {
        ...result,
        preset: data.preset,
        presetDescription: getScanPresetDescription(data.preset as ScanPresetType),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start device scan', {
        error: errorMessage,
        deviceId: data.deviceId,
        target: data.target,
        preset: data.preset,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
