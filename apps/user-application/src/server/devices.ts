import { createServerFn } from '@tanstack/react-start'
import {
  getDevicesForTenant,
  getDeviceById,
  deleteDevice as deleteDeviceDB,
  createMultipleDevicesFromDiscovery,
  updateDevice,
  getDeviceTagSuggestions,
  getDeviceScanHistory,
  verifyDevice as verifyDeviceDB,
  unverifyDevice as unverifyDeviceDB,
  getScanScheduleByDeviceId,
  type DeviceQueryParams,
  type DeviceUpdateData
} from '@repo/data-ops'
import { createLogger } from '@repo/logger'
import { z } from 'zod'
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth'
import { formatServerError } from './utils/errors'

const logger = createLogger({ name: 'devices-server' })

// IP address validation regex
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

/**
 * Transformed device type with UI-friendly properties
 * Returned by transformDeviceForUI and used in UI components
 */
export type TransformedDevice = {
  id: string;
  name: string;
  ip: string;
  riskLevel: string;
  status: 'active' | 'offline';
  discoveredOn: string;
  lastScanned?: string;
  source: 'agentless' | 'agentbased';
  isScanned: boolean;
  scanType: 'scanned' | 'discovered';
  scope: 'internal' | 'external' | 'hybrid';
  tags: string[];
  respondsToICMPPing: boolean;
  notes: string;
  scanCount: number;
  totalOpenPorts: number;
  ports?: {
    tcp: number[];
    details: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: {
        name?: string | null;
        product?: string | null;
        version?: string | null;
        extraInfo?: string | null;
        tunnel?: string | null;
        method?: string | null;
        confidence?: number | null;
        cpe?: string | null;
        fingerprint?: string | null;
        fingerprintMatches?: Array<{
          probe: string;
          length?: number;
          response: string;
        }>;
      };
      discoveredBy?: string[];
      firstSeen?: number | null;
      lastSeen?: number | null;
    }>;
  };
  scanStats?: {
    scanCount: number;
    totalScans?: number;
    lastScanAt: string | null;
    openPortCount?: number;
    totalPortCount?: number;
    ports?: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: {
        name?: string | null;
        product?: string | null;
        version?: string | null;
        extraInfo?: string | null;
        tunnel?: string | null;
        method?: string | null;
        confidence?: number | null;
        cpe?: string | null;
        fingerprint?: string | null;
        fingerprintMatches?: Array<{
          probe: string;
          length?: number;
          response: string;
        }>;
      };
      discoveredBy?: string[];
      firstSeen?: number | null;
      lastSeen?: number | null;
    }>;
  };
  verificationStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  isVerified: boolean;
};

// Validation schemas
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
  })
})

// Transform database device to match UI expectations
function transformDeviceForUI(dbDevice: any) {
  const scanStats = dbDevice.scanStats as
    | {
        scanCount: number;
        totalScans?: number;
        lastScanAt: number | null;  // Database returns timestamp as number (milliseconds)
        openPortCount?: number;
        totalPortCount?: number;
        ports?: Array<{
          port: number;
          protocol: string;
          state: string;
          service?: {
            name?: string | null;
            product?: string | null;
            version?: string | null;
            extraInfo?: string | null;
            tunnel?: string | null;
            method?: string | null;
            confidence?: number | null;
            cpe?: string | null;
            fingerprint?: string | null;
            fingerprintMatches?: Array<{
              probe: string;
              length?: number;
              response: string;
            }>;
          };
          discoveredBy?: string[];
          firstSeen?: number | null;
          lastSeen?: number | null;
        }>;
      }
    | undefined;

  // Convert timestamp (number or Date) to ISO string
  const lastScanTimestamp = scanStats?.lastScanAt ?? dbDevice.lastSeenAt ?? null;
  const lastScanIso = lastScanTimestamp
    ? (lastScanTimestamp instanceof Date
        ? lastScanTimestamp.toISOString()
        : new Date(lastScanTimestamp).toISOString())
    : null;
  const openPortEntries = Array.isArray(scanStats?.ports)
    ? scanStats?.ports
    : [];
  const openPortCount = scanStats?.openPortCount ?? openPortEntries.length;

  const totalPortCount = scanStats?.totalPortCount ?? openPortCount;
  const totalScans = scanStats?.scanCount && scanStats.scanCount > 0
    ? scanStats.scanCount
    : dbDevice.isScanned
      ? 1
      : 0;
  const hasScans = totalScans > 0;
  const discoveredAt: Date = dbDevice.discoveredAt instanceof Date
    ? dbDevice.discoveredAt
    : new Date(dbDevice.discoveredAt ?? Date.now());

  const ports = openPortEntries.length > 0
    ? {
        tcp: openPortEntries.map((port) => port.port),
        details: openPortEntries,
      }
    : undefined;

  const computedScanStats = hasScans
    ? {
        ...scanStats,
        totalScans,
        scanCount: scanStats?.scanCount ?? totalScans,
        lastScanAt: lastScanIso,
        openPortCount,
        totalPortCount,
        ports: openPortEntries,
      }
    : undefined;

  return {
    id: dbDevice.id,
    name: dbDevice.name,
    ip: dbDevice.ip || '0.0.0.0',
    riskLevel: dbDevice.riskLevel.toLowerCase(), // DB uses uppercase, UI expects lowercase
    status: dbDevice.state === 'AVAILABLE' ? 'active' : 'offline',
    discoveredOn: discoveredAt.toISOString(),
    lastScanned: lastScanIso ?? undefined,
    source: dbDevice.source.toLowerCase() as 'agentless' | 'agentbased',
    isScanned: hasScans,
    scanType: hasScans ? ('scanned' as const) : ('discovered' as const),
    scope: dbDevice.scope.toLowerCase() as 'internal' | 'external' | 'hybrid',
    tags: dbDevice.tags || [],
    respondsToICMPPing: dbDevice.respondsToPing,
    notes: dbDevice.notes || '',
    scanCount: totalScans,
    totalOpenPorts: openPortCount,
    ports,
    scanStats: computedScanStats,
    // Verification metadata
    verificationStatus: dbDevice.verificationStatus,
    verifiedAt: dbDevice.verifiedAt ? new Date(dbDevice.verifiedAt).toISOString() : null,
    verifiedBy: dbDevice.verifiedBy,
    verificationNote: dbDevice.verificationNote,
    isVerified: dbDevice.verificationStatus === 'VERIFIED',
  }
}

const GetDevicesDataSchema = z.object({
  verificationStatus: z.union([
    z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
    z.array(z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']))
  ]).optional()
})

export const getDevicesData = createServerFn({
  method: 'POST',
})
  .inputValidator(GetDevicesDataSchema.parse)
  .handler(async ({ data }) => {
  try {
    logger.info('Fetching devices from database', {
      verificationStatus: data?.verificationStatus
    })

    // Get session for organization context
    const organizationId = await getCurrentOrganizationId()
    logger.info('Fetching devices for organization', {
      organizationId,
      verificationStatus: data?.verificationStatus
    })

    // Query database with organization filter and verification status
    const queryParams: DeviceQueryParams = {
      page: 1,
      pageSize: 50, // Get more devices by default
      sortColumn: 'discoveredAt',
      sortDirection: 'desc',
      verificationStatus: data?.verificationStatus
    }

    const devicesResponse = await getDevicesForTenant(organizationId, queryParams)

    logger.info('Successfully fetched devices from database', {
      deviceCount: devicesResponse.items.length,
      totalCount: devicesResponse.totalCount
    })

    // Transform devices to match UI expectations
    const transformedDevices = devicesResponse.items.map(transformDeviceForUI)

    return {
      items: transformedDevices,
      totalCount: devicesResponse.totalCount,
      page: devicesResponse.page,
      totalPages: devicesResponse.totalPages
    }
  } catch (error) {
    logger.error('Failed to fetch devices', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    })

    // Return empty response on error
    return {
      items: [],
      totalCount: 0,
      page: 1,
      totalPages: 0
    }
  }
})

type DeviceDetailParams = {
  deviceId: string
}

export const getDeviceDetailData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: DeviceDetailParams) => {
    if (!data || !data.deviceId) {
      throw new Error('Device ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
  const { deviceId } = data;
  try {
    logger.info('Fetching device detail', { deviceId })

    // Get session for organization context
    const organizationId = await getCurrentOrganizationId()
    const deviceDetail = await getDeviceById(deviceId, organizationId)

    if (!deviceDetail) {
      throw new Error('Device not found')
    }

    logger.info('Successfully fetched device detail', {
      deviceId,
      deviceName: deviceDetail.name
    })

    return transformDeviceForUI(deviceDetail)
  } catch (error) {
    logger.error('Failed to fetch device detail', { error, deviceId })
    throw error
  }
})

// Mock vulnerabilities for now (until we implement vulnerability tracking)
export const getDeviceVulnerabilitiesData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string; page?: number; sortColumn?: string; sortDirection?: string }) => {
    if (!data || !data.deviceId) {
      throw new Error('Device ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
  const { deviceId, page = 1 } = data;

  try {
    logger.info('Returning mock vulnerabilities for device', { deviceId })

    // Return mock data for now
    return {
      page: 1,
      totalPages: 1,
      totalCount: 3,
      items: [
        {
          id: 1,
          cve: 'CVE-2023-12345',
          summary: 'Remote code execution vulnerability',
          severity: 'critical' as const,
          cvss_score: 9.8,
          state: 'discovered',
          element_id: deviceId
        },
        {
          id: 2,
          cve: 'CVE-2023-67890',
          summary: 'Cross-site scripting vulnerability',
          severity: 'high' as const,
          cvss_score: 7.5,
          state: 'discovered',
          element_id: deviceId
        },
        {
          id: 3,
          cve: 'CVE-2023-11111',
          summary: 'Information disclosure vulnerability',
          severity: 'medium' as const,
          cvss_score: 5.3,
          state: 'discovered',
          element_id: deviceId
        }
      ]
    }
  } catch (error) {
    logger.error('Failed to fetch device vulnerabilities', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      deviceId,
      page
    })
    throw error
  }
})

export const deleteDevice = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string }) => {
    logger.info('deleteDevice input validation', {
      data,
      deviceId: data?.deviceId,
      deviceIdType: typeof data?.deviceId,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : null
    });

    if (!data?.deviceId || typeof data.deviceId !== 'string') {
      throw new Error(`Device ID is required and must be a string, received: ${JSON.stringify(data)}`);
    }
    return data;
  })
  .handler(async ({ data }) => {
  const { deviceId } = data;

  try {
    // Get session for organization context
    const organizationId = await getCurrentOrganizationId()
    logger.info('Deleting device', { deviceId, organizationId });

    // First check if device exists for this organization
    try {
      const existingDevice = await getDeviceById(deviceId, organizationId);
      logger.info('Device lookup result', {
        deviceId,
        organizationId,
        found: !!existingDevice,
        deviceName: existingDevice?.name
      });

      if (!existingDevice) {
        throw new Error('Device not found or access denied');
      }
    } catch (lookupError) {
      logger.error('Device lookup failed', {
        deviceId,
        organizationId,
        lookupError: formatServerError(lookupError)
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
      message: `Device ${deviceId} deleted successfully`
    };
  } catch (error) {
    logger.error('Failed to delete device', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      deviceId
    })

    throw error;
  }
})

/**
 * Get devices from discovery for onboarding
 * Accepts organizationId to work during onboarding before session context is established
 */
export const getDiscoveryDevices = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { organizationId?: string }) => {
    return data;
  })
  .handler(async ({ data }) => {
    try {
      // Use provided organizationId during onboarding, otherwise get from session
      const organizationId = data.organizationId || await getCurrentOrganizationId();

      logger.info('Fetching discovery devices', {
        organizationId,
        source: data.organizationId ? 'onboarding' : 'session'
      });

      const devicesResponse = await getDevicesForTenant(organizationId, {
        page: 1,
        pageSize: 100,
        sortColumn: 'discoveredAt',
        sortDirection: 'desc',
      });

      // Filter out ONBOARDING devices (the project placeholder)
      // Include DISCOVERY devices and any EXTERNAL scope devices
      const discoveryDevices = devicesResponse.items.filter(
        (device: typeof devicesResponse.items[number]) => device.source !== 'ONBOARDING'
      );

      logger.info('Filtered discovery devices', {
        beforeFilter: devicesResponse.items.length,
        afterFilter: discoveryDevices.length,
        allDevices: devicesResponse.items.map((d: typeof devicesResponse.items[number]) => ({
          source: d.source,
          scope: d.scope,
          name: d.name
        }))
      });

      logger.info('Discovery devices fetched', {
        organizationId,
        totalDevices: devicesResponse.items.length,
        discoveryDevicesCount: discoveryDevices.length
      });

      return {
        success: true,
        devices: discoveryDevices.map((d: typeof discoveryDevices[number]) => ({
          id: d.id,
          name: d.name,
          ip: d.ip || null,
        })),
        count: discoveryDevices.length
      };
    } catch (error) {
      logger.error('Failed to fetch discovery devices', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });

      return {
        success: false,
        devices: [],
        count: 0
      };
    }
  });

export const createDevicesFromDiscovery = createServerFn({
  method: 'POST',
})
  .inputValidator((data: {
    targets: Array<{host: string, ip?: string}>,
    organizationId?: string,
    projectId?: string,
    options?: {
      source?: string;
      scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
      verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
    }
  }) => {
    logger.info('createDevicesFromDiscovery input validation', {
      data,
      targetsLength: data?.targets?.length,
      dataType: typeof data,
      projectId: data?.projectId,
      options: data?.options
    });

    if (!data?.targets?.length) {
      logger.error('No targets provided for device creation', { data });
      throw new Error('At least one target is required');
    }

    // Validate each target
    for (const target of data.targets) {
      if (!target.host?.trim()) {
        logger.error('Invalid target provided', { target });
        throw new Error('All targets must have a valid hostname');
      }
    }

    logger.info('Input validation passed', {
      targetCount: data.targets.length,
      targets: data.targets.map(t => ({ host: t.host, hasIp: !!t.ip })),
      projectId: data.projectId,
      options: data.options
    });

    return data;
  })
  .handler(async ({ data }) => {
    try {
      logger.info('Starting createDevicesFromDiscovery handler', {
        targetCount: data.targets.length,
        projectId: data.projectId,
        options: data.options,
        hasOrganizationId: !!data.organizationId
      });

      // Use provided organizationId during onboarding, otherwise get from session
      const organizationId = data.organizationId || await getCurrentOrganizationId();

      logger.info('Creating devices from discovery', {
        organizationId,
        projectId: data.projectId,
        targetCount: data.targets.length,
        targets: data.targets,
        options: data.options,
        source: data.organizationId ? 'onboarding' : 'session'
      });

      const createdDevices = await createMultipleDevicesFromDiscovery(
        data.targets,
        organizationId,
        {
          ...data.options,
          projectId: data.projectId,
        }
      );

      logger.info('Successfully created devices from discovery', {
        organizationId,
        createdCount: createdDevices.length,
        deviceIds: createdDevices.map(d => d.id)
      });

      const response = {
        success: true,
        devices: createdDevices.map(transformDeviceForUI),
        count: createdDevices.length
      };

      logger.info('Returning successful response', {
        responseCount: response.count,
        hasDevices: response.devices.length > 0
      });

      return response;
    } catch (error) {
      logger.error('Failed to create devices from discovery', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        targetCount: data.targets.length,
        targets: data.targets
      });

      throw error;
    }
  })

// Update a device
export const updateDeviceData = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { deviceId: string; updates: DeviceUpdateData }) => {
    return UpdateDeviceSchema.parse(data);
  })
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      logger.info('Updating device', {
        deviceId: data.deviceId,
        organizationId,
        updateFields: Object.keys(data.updates)
      });

      const updatedDevice = await updateDevice(
        data.deviceId,
        data.updates,
        organizationId
      );

      if (!updatedDevice) {
        throw new Error('Device not found or update failed');
      }

      logger.info('Device updated successfully', {
        deviceId: updatedDevice.id,
        name: updatedDevice.name
      });

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice)
      };
    } catch (error) {
      logger.error('Failed to update device', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        deviceId: data.deviceId
      });

      throw error;
    }
  })

// Get tag suggestions for device editing
export const getDeviceTagSuggestionsData = createServerFn({
  method: 'GET',
})
  .inputValidator(() => ({}))
  .handler(async () => {
    try {
      const organizationId = await getCurrentOrganizationId();

      logger.info('Fetching device tag suggestions', {
        organizationId
      });

      const tagSuggestions = await getDeviceTagSuggestions(organizationId);

      logger.info('Tag suggestions fetched successfully', {
        tagCount: tagSuggestions.length
      });

      return tagSuggestions;
    } catch (error) {
      logger.error('Failed to fetch tag suggestions', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error
      });

      // Return empty array on error instead of throwing
      return [];
    }
  })

// Verification schema
const VerifyDeviceSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  status: z.enum(['VERIFIED', 'EXCLUDED', 'CANDIDATE']),
  note: z.string().max(500).optional(),
})

// Verify or exclude a device
export const verifyDevice = createServerFn({
  method: 'POST',
})
  .inputValidator(VerifyDeviceSchema.parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId()
      const currentUser = await getCurrentUser()

      logger.info('Verifying device', {
        deviceId: data.deviceId,
        status: data.status,
        userId: currentUser.id,
        organizationId
      })

      // Get current device state for logging
      const currentDevice = await getDeviceById(data.deviceId, organizationId)
      if (!currentDevice) {
        throw new Error('Device not found')
      }

      // Update device verification status
      const updatedDevice = await updateDevice(
        data.deviceId,
        {
          verificationStatus: data.status,
          verifiedAt: new Date(),
          verifiedBy: currentUser.id,
          verificationNote: data.note || null,
        },
        organizationId
      )

      // Log verification change event
      logger.info('Device verification changed', {
        event: 'verification.change',
        deviceId: data.deviceId,
        deviceName: currentDevice.name,
        oldStatus: currentDevice.verificationStatus,
        newStatus: data.status,
        verifiedBy: currentUser.id,
        verifiedByEmail: currentUser.email,
        note: data.note,
        organizationId
      })

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice)
      }
    } catch (error) {
      logger.error('Failed to verify device', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        deviceId: data.deviceId
      })

      throw new Error('Failed to update device verification status')
    }
  })

/**
 * Get scan history for a device
 */
const GetDeviceScanHistorySchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  limit: z.number().optional().default(10)
});

export const getDeviceScanHistoryData = createServerFn({ method: 'POST' })
  .inputValidator(GetDeviceScanHistorySchema.parse)
  .handler(async ({ data }) => {
    const { deviceId, limit } = data;
    const organizationId = await getCurrentOrganizationId();

    try {
      const history = await getDeviceScanHistory(organizationId, deviceId, limit);

      logger.info('Fetched scan history', {
        deviceId,
        count: history.length,
        sample: history[0] ? {
          id: history[0].id,
          requestedAt: history[0].requestedAt,
          requestedAtType: typeof history[0].requestedAt,
          hasResultSummary: !!history[0].resultSummary,
          resultSummaryType: typeof history[0].resultSummary,
        } : null
      });

      return { success: true, history };
    } catch (error) {
      logger.error('Failed to fetch device scan history', {
        error: error instanceof Error ? error.message : error,
        deviceId,
      });
      return { success: false, history: [] };
    }
  })

/**
 * Toggle device verification with automatic scan scheduling
 */
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
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const currentUser = await getCurrentUser();

      logger.info('Toggling device verification', {
        deviceId: data.deviceId,
        verify: data.verify,
        interval: data.interval,
        userId: currentUser.id,
        organizationId
      });

      // Get device details
      const device = await getDeviceById(data.deviceId, organizationId);
      if (!device) {
        throw new Error('Device not found');
      }

      if (data.verify) {
        // VERIFY: Update device status
        // TODO: Implement scheduled scanning with Restate (sec-xx)
        // const scheduleId = `scan-device-${device.id}`;

        // 1. Verify device in DB
        await verifyDeviceDB(data.deviceId, organizationId, currentUser.id, data.note);

        // 2. TODO: Create Restate schedule for recurring scans
        // For now, just verify the device without scheduling
        // This can be implemented later using Restate's durable timers or cron

        logger.info('Device verified (scheduling not yet implemented)', {
          deviceId: device.id,
          interval: data.interval
        });

        return {
          success: true,
          verified: true,
          message: `Device verified successfully`
        };
      } else {
        // UNVERIFY: Delete schedule and update device status
        const existingSchedule = await getScanScheduleByDeviceId(data.deviceId, organizationId);

        if (existingSchedule) {
          // TODO: Delete Restate schedule when implemented
          logger.info('Schedule exists but scheduling not implemented yet', {
            deviceId: device.id,
            scheduleId: existingSchedule.scheduleId
          });
        }

        // Unverify device (also deletes schedule record in DB)
        await unverifyDeviceDB(data.deviceId, organizationId);

        logger.info('Device unverified', {
          deviceId: device.id
        });

        return {
          success: true,
          verified: false,
          message: 'Device unverified successfully'
        };
      }
    } catch (error) {
      logger.error('Failed to toggle device verification', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        deviceId: data.deviceId,
        verify: data.verify
      });

      throw new Error('Failed to toggle device verification');
    }
  })

/**
 * Secure device scanning with server-side configuration
 *
 * Security: All scan parameters are defined server-side using presets.
 * Clients can only choose which preset to use, preventing abuse of:
 * - Excessive timeouts
 * - Aggressive scanning
 * - Arbitrary port ranges
 * - Resource exhaustion
 */

import { buildScanInputFromPreset, type ScanPresetType, getScanPresetDescription } from './devices/scan-presets';
import { startPortScanWorkflow } from './discovery';

const StartDeviceScanSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
  target: z.string().min(1, 'Target is required'),
  preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
});

export const startDeviceScan = createServerFn({
  method: 'POST',
})
  .inputValidator(StartDeviceScanSchema.parse)
  .handler(async ({ data }) => {
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

      // Build scan input from server-side preset
      // Client cannot manipulate timeout, port ranges, or scan profiles
      const scanInput = buildScanInputFromPreset(
        data.preset as ScanPresetType,
        data.target,
        data.deviceId
      );

      // Execute scan using existing workflow
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
  })
