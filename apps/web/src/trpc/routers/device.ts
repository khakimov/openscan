import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import type { TrpcContext } from '../trpc';
import {
  getDevicesForTenant,
  getDeviceCounts,
  validateProjectAccess,
  getOrganizationIdFromProject,
  getDeviceById,
  getDeviceTagSuggestions,
  getDeviceScanHistory,
  deleteDevice as deleteDeviceDB,
  updateDevice,
  createMultipleDevicesFromDiscovery,
  verifyDevice as verifyDeviceDB,
  unverifyDevice as unverifyDeviceDB,
  getActiveScansForDevices,
  type DeviceUpdateData,
} from '@repo/data-ops';
import { transformDeviceForUI } from '@/server/devices/transforms';
import {
  buildScanInputFromPreset,
  type ScanPresetType,
  getScanPresetDescription,
} from '@/server/devices/scan-presets';
import { startPortScanWorkflow, getActiveDeviceScans } from '@/server/discovery/index';
// Note: Using batch getActiveScansForDevices from @repo/data-ops instead of individual getActiveDeviceScans
import { notifyServerPromoted } from '@/server/notifications/notify-server-promoted';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'device-trpc' });

/**
 * Helper to require organizationId from protected context
 * Throws PRECONDITION_FAILED if user has no organizations
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

/**
 * Device router - OpenPanel pattern
 * All device queries go through tRPC to avoid authentication context issues
 */
export const deviceRouter = createTRPCRouter({
  /**
   * List devices for current user's organization with optional filters
   */
  list: protectedProcedure
    .input(z.object({
      verificationStatus: z
        .union([
          z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
          z.array(z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']))
        ])
        .optional(),
      projectId: z.string().optional(),
      page: z.number().optional().default(1),
      pageSize: z.number().optional().default(50),
      sortColumn: z.string().optional().default('discoveredAt'),
      sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
    }))
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      const user = ctx.user;
      let projectId: string | undefined;

      // If projectId provided, validate access and derive organizationId
      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);
        if (!derivedOrgId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found'
          });
        }

        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);
        if (!access) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Project not found or access denied'
          });
        }

        organizationId = access.organization.id;
        projectId = access.project.id;
      } else {
        organizationId = requireOrganizationId(ctx);
      }

      // Fetch devices using data-ops
      const devices = await getDevicesForTenant(organizationId, {
        page: input.page,
        pageSize: input.pageSize,
        sortColumn: input.sortColumn,
        sortDirection: input.sortDirection,
        verificationStatus: input.verificationStatus,
        projectId,
      });

      return devices;
    }),

  /**
   * Get device counts by verification status
   * Lightweight endpoint for tab counters (no device data)
   */
  counts: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user;
      const organizationId = requireOrganizationId(ctx);

      // If projectId provided, validate access
      if (input.projectId) {
        await validateProjectAccess(user.id, input.projectId, organizationId);
      }

      const counts = await getDeviceCounts(organizationId, input.projectId);
      return counts;
    }),

  /**
   * List devices with details (activeScans + scanHistory) - optimized query
   * Reduces N+1 queries by fetching all related data upfront
   */
  listWithDetails: protectedProcedure
    .input(z.object({
      verificationStatus: z
        .union([
          z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
          z.array(z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']))
        ])
        .optional(),
      projectId: z.string().optional(),
      page: z.number().optional().default(1),
      pageSize: z.number().optional().default(50),
      sortColumn: z.string().optional().default('discoveredAt'),
      sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
      includeHistory: z.boolean().optional().default(true),
      historyLimit: z.number().int().positive().optional().default(10),
    }))
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      const user = ctx.user;
      let projectId: string | undefined;

      // If projectId provided, validate access and derive organizationId
      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);
        if (!derivedOrgId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found'
          });
        }

        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);
        if (!access) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Project not found or access denied'
          });
        }

        organizationId = access.organization.id;
        projectId = access.project.id;
      } else {
        organizationId = requireOrganizationId(ctx);
      }

      // Fetch devices, counts, and active scans in parallel
      const [devicesResponse, counts] = await Promise.all([
        getDevicesForTenant(organizationId, {
          page: input.page,
          pageSize: input.pageSize,
          sortColumn: input.sortColumn,
          sortDirection: input.sortDirection,
          verificationStatus: input.verificationStatus,
          projectId,
        }),
        getDeviceCounts(organizationId, projectId),
      ]);

      // Fetch active scans and history for all devices in parallel
      const deviceIds = devicesResponse.items.map((d: { id: string }) => d.id);

      // Use batch query for active scans (single query for all devices)
      const [activeScansByDevice, historyResults] = await Promise.all([
        // Fetch all active scans in a single batch query
        getActiveScansForDevices(organizationId, deviceIds),
        // Fetch scan history for all devices (if requested)
        input.includeHistory
          ? Promise.all(
              deviceIds.map(async (deviceId: string) => {
                const history = await getDeviceScanHistory(organizationId, deviceId, input.historyLimit);
                return { deviceId, history };
              })
            )
          : [],
      ]);

      // Build lookup map for history
      const historyByDevice = new Map(
        historyResults.map((r: { deviceId: string; history: any[] }) => [r.deviceId, r.history])
      );

      // Enrich devices with their related data
      const enrichedItems = devicesResponse.items.map((device: any) => ({
        ...device,
        activeScans: activeScansByDevice.get(device.id)?.map(s => s.scanRun.restateWorkflowId) ?? [],
        scanHistory: input.includeHistory ? (historyByDevice.get(device.id) ?? []) : undefined,
      }));

      logger.info('Fetched devices with details', {
        deviceCount: enrichedItems.length,
        includeHistory: input.includeHistory,
        activeScansQueries: 1, // Batch query
      });

      return {
        ...devicesResponse,
        items: enrichedItems,
        counts,
      };
    }),

  /**
   * Get single device detail
   */
  detail: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      const user = ctx.user;

      // If projectId provided, validate access and derive organizationId
      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);
        if (!derivedOrgId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found'
          });
        }

        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);
        if (!access) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Project not found or access denied'
          });
        }

        organizationId = access.organization.id;
      } else {
        organizationId = requireOrganizationId(ctx);
      }

      logger.info('Fetching device detail via tRPC', {
        deviceId: input.deviceId,
        organizationId,
      });

      const deviceDetail = await getDeviceById(input.deviceId, organizationId);

      if (!deviceDetail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found',
        });
      }

      logger.info('Successfully fetched device detail', {
        deviceId: input.deviceId,
        deviceName: deviceDetail.name,
      });

      return transformDeviceForUI(deviceDetail);
    }),

  /**
   * Get device vulnerabilities (mock data until vulnerability tracking is implemented)
   */
  vulnerabilities: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      page: z.number().int().positive().optional().default(1),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { deviceId } = input;

      logger.info('Returning mock vulnerabilities for device via tRPC', { deviceId });

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
    }),

  /**
   * Get device scan history
   */
  scanHistory: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      limit: z.number().int().positive().optional().default(10),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      const user = ctx.user;

      // If projectId provided, validate access and derive organizationId
      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);
        if (!derivedOrgId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);
        if (!access) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Project not found or access denied' });
        }
        organizationId = access.organization.id;
      } else {
        organizationId = requireOrganizationId(ctx);
      }

      const { deviceId, limit } = input;

      logger.info('Fetching scan history via tRPC', {
        deviceId,
        organizationId,
        limit,
      });

      const history = await getDeviceScanHistory(organizationId, deviceId, limit);

      logger.info('Fetched scan history', {
        deviceId,
        count: history.length,
      });

      return { success: true, history };
    }),

  /**
   * Get tag suggestions for devices in organization
   */
  tagSuggestions: protectedProcedure
    .query(async ({ ctx }) => {
      const organizationId = requireOrganizationId(ctx);

      logger.info('Fetching device tag suggestions via tRPC', { organizationId });

      const tagSuggestions = await getDeviceTagSuggestions(organizationId);

      logger.info('Tag suggestions fetched successfully', {
        tagCount: tagSuggestions.length,
      });

      return tagSuggestions;
    }),

  /**
   * Get active scans for a device
   */
  activeScans: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      projectId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      const user = ctx.user;

      // If projectId provided, validate access and derive organizationId
      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);
        if (!derivedOrgId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
        }
        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);
        if (!access) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Project not found or access denied' });
        }
        organizationId = access.organization.id;
      } else {
        organizationId = requireOrganizationId(ctx);
      }

      logger.info('Fetching active device scans via tRPC', {
        deviceId: input.deviceId,
        organizationId
      });

      const result = await getActiveDeviceScans({ data: { deviceId: input.deviceId, organizationId } });

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error ?? 'Failed to fetch active scans',
        });
      }

      logger.info('Active scans fetched successfully', {
        deviceId: input.deviceId,
        scanCount: result.activeScans?.length ?? 0,
      });

      return result.activeScans ?? [];
    }),

  /**
   * Delete a device
   */
  remove: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const { deviceId } = input;

      logger.info('Deleting device via tRPC', { deviceId, organizationId });

      const existingDevice = await getDeviceById(deviceId, organizationId);
      if (!existingDevice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found or access denied',
        });
      }

      const deleted = await deleteDeviceDB(deviceId, organizationId);

      if (!deleted) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete device',
        });
      }

      logger.info('Device deleted successfully', { deviceId });

      return {
        success: true,
        message: `Device ${deviceId} deleted successfully`,
      };
    }),

  /**
   * Update device
   */
  update: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      updates: z.object({
        name: z.string().min(1).max(255).optional(),
        ip: z.string().optional(),
        riskLevel: z.enum(['SECURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
        state: z.string().optional(),
        scope: z.enum(['INTERNAL', 'EXTERNAL', 'HYBRID']).optional(),
        source: z.string().optional(),
        isScanned: z.boolean().optional(),
        respondsToPing: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);

      logger.info('Updating device via tRPC', {
        deviceId: input.deviceId,
        organizationId,
        updateFields: Object.keys(input.updates),
      });

      // Fetch current device state before update
      const currentDevice = await getDeviceById(input.deviceId, organizationId);
      if (!currentDevice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found',
        });
      }

      const updatedDevice = await updateDevice(
        input.deviceId,
        input.updates as DeviceUpdateData,
        organizationId,
      );

      if (!updatedDevice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found or update failed',
        });
      }

      logger.info('Device updated successfully', {
        deviceId: updatedDevice.id,
        name: updatedDevice.name,
      });

      // Log manual edit notification for audit trail
      try {
        const { logManualEdit } = await import('@repo/data-ops');
        const changedFields = Object.keys(input.updates).filter((key) => {
          const oldValue = (currentDevice as any)[key];
          const newValue = input.updates[key as keyof typeof input.updates];
          return JSON.stringify(oldValue) !== JSON.stringify(newValue);
        });

        // Log manual edit notifications for each changed field
        for (const field of changedFields) {
          const oldValue = String((currentDevice as any)[field] ?? '');
          const newValue = String(input.updates[field as keyof typeof input.updates] ?? '');
          await logManualEdit({
            deviceId: input.deviceId,
            deviceName: updatedDevice.name || updatedDevice.ip || input.deviceId,
            organizationId,
            fieldChanged: field,
            oldValue,
            newValue,
            editedBy: ctx.user.email || ctx.user.id,
          });
        }
        if (changedFields.length > 0) {
          logger.info('Manual edit notification logged', {
            deviceId: input.deviceId,
            changedFields,
          });
        }
      } catch (error) {
        logger.error('Failed to log manual edit notification', {
          deviceId: input.deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the update if notification fails
      }

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice),
      };
    }),

  /**
   * Verify device with status and optional note
   */
  verify: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      status: z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Verifying device via tRPC', {
        deviceId: input.deviceId,
        status: input.status,
        userId: user.id,
        organizationId,
      });

      const currentDevice = await getDeviceById(input.deviceId, organizationId);
      if (!currentDevice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found',
        });
      }

      const updatedDevice = await updateDevice(
        input.deviceId,
        {
          verificationStatus: input.status,
          verifiedAt: new Date(),
          verifiedBy: user.id,
          verificationNote: input.note || null,
        },
        organizationId,
      );

      logger.info('Device verification changed', {
        event: 'verification.change',
        deviceId: input.deviceId,
        deviceName: currentDevice.name,
        oldStatus: currentDevice.verificationStatus,
        newStatus: input.status,
        verifiedBy: user.id,
        verifiedByEmail: user.email,
        note: input.note,
        organizationId,
      });

      // Send celebration notification if device was promoted to VERIFIED
      if (currentDevice.verificationStatus !== 'VERIFIED' && input.status === 'VERIFIED') {
        try {
          await notifyServerPromoted(
            {
              deviceId: input.deviceId,
              deviceName: currentDevice.name || currentDevice.ip || input.deviceId,
              organizationId,
              previousStatus: currentDevice.verificationStatus,
              newStatus: input.status,
            },
            ctx.env
          );
          logger.info('Server promoted notification sent', {
            deviceId: input.deviceId,
            deviceName: currentDevice.name,
          });
        } catch (error) {
          logger.error('Failed to send server promoted notification', {
            error: error instanceof Error ? error.message : String(error),
            deviceId: input.deviceId,
          });
          // Don't fail the verification if notification fails
        }
      }

      return {
        success: true,
        device: transformDeviceForUI(updatedDevice),
      };
    }),

  /**
   * Toggle device verification on/off
   */
  toggleVerification: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      verify: z.boolean(),
      interval: z.string().optional().default('1h'),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Toggling device verification via tRPC', {
        deviceId: input.deviceId,
        verify: input.verify,
        interval: input.interval,
        userId: user.id,
        organizationId,
      });

      const device = await getDeviceById(input.deviceId, organizationId);
      if (!device) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Device not found',
        });
      }

      if (input.verify) {
        const previousStatus = device.verificationStatus;
        await verifyDeviceDB(input.deviceId, organizationId, user.id, input.note);

        logger.info('Device verified (scheduling not yet implemented)', {
          deviceId: device.id,
          interval: input.interval,
        });

        // Send celebration notification if device was promoted to VERIFIED
        if (previousStatus !== 'VERIFIED') {
          try {
            await notifyServerPromoted(
              {
                deviceId: input.deviceId,
                deviceName: device.name || device.ip || input.deviceId,
                organizationId,
                previousStatus,
                newStatus: 'VERIFIED',
              },
              ctx.env
            );
            logger.info('Server promoted notification sent (toggleVerification)', {
              deviceId: input.deviceId,
              deviceName: device.name,
            });
          } catch (error) {
            logger.error('Failed to send server promoted notification (toggleVerification)', {
              error: error instanceof Error ? error.message : String(error),
              deviceId: input.deviceId,
            });
            // Don't fail the verification if notification fails
          }
        }

        return {
          success: true,
          verified: true,
          message: 'Device verified successfully',
        };
      }

      await unverifyDeviceDB(input.deviceId, organizationId);

      logger.info('Device unverified', {
        deviceId: device.id,
      });

      return {
        success: true,
        verified: false,
        message: 'Device unverified successfully',
      };
    }),

  /**
   * Start device scan with preset
   */
  startScan: protectedProcedure
    .input(z.object({
      deviceId: z.string().min(1, 'Device ID is required'),
      target: z.string().min(1, 'Target is required'),
      preset: z.enum(['QUICK', 'STANDARD', 'THOROUGH']),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Starting device scan via tRPC', {
        deviceId: input.deviceId,
        target: input.target,
        preset: input.preset,
        organizationId,
        userId: user.id,
      });

      const scanInput = buildScanInputFromPreset(
        input.preset as ScanPresetType,
        input.target,
        input.deviceId,
      );

      const workflowResult = await startPortScanWorkflow({
        data: { ...scanInput, organizationId, userId: user.id },
      });

      if (workflowResult.success) {
        logger.info('Device scan started successfully', {
          deviceId: input.deviceId,
          target: input.target,
          preset: input.preset,
          scanId: workflowResult.scanId,
        });

        return {
          success: true,
          scanId: workflowResult.scanId,
          scanRunId: workflowResult.scanRunId,
          target: workflowResult.target ?? input.target,
          ports: workflowResult.ports,
          totalPorts: workflowResult.totalPorts,
          message: workflowResult.message,
          preset: input.preset,
          presetDescription: getScanPresetDescription(input.preset as ScanPresetType),
        };
      }

      const failureMessage = workflowResult.error ?? 'Failed to start device scan';

      return {
        success: false,
        error: failureMessage,
        target: workflowResult.target ?? input.target,
        preset: input.preset,
        presetDescription: getScanPresetDescription(input.preset as ScanPresetType),
      };
    }),

  /**
   * Create devices from discovery
   */
  createFromDiscovery: protectedProcedure
    .input(z.object({
      targets: z.array(z.object({
        host: z.string().min(1, 'Host is required'),
        ip: z.string().optional(),
      })).min(1, 'At least one target is required'),
      projectId: z.string().optional(),
      options: z.object({
        source: z.string().optional(),
        scope: z.enum(['INTERNAL', 'EXTERNAL', 'HYBRID']).optional(),
        verificationStatus: z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']).optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      logger.info('Creating devices from discovery via tRPC', {
        targetCount: input.targets.length,
        projectId: input.projectId,
        options: input.options,
        userId: user.id,
      });

      let organizationId: string;
      let validatedProjectId: string | null = input.projectId ?? null;

      if (input.projectId) {
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);

        if (!derivedOrgId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied',
          });
        }

        const access = await validateProjectAccess(user.id, input.projectId, derivedOrgId);

        if (!access) {
          logger.warn('Project access validation failed for device discovery', {
            userId: user.id,
            projectId: input.projectId,
            derivedOrgId,
          });
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Project not found or access denied',
          });
        }

        organizationId = access.organization.id;
        validatedProjectId = access.project.id;

        logger.info('Derived organizationId from projectId', {
          projectId: input.projectId,
          organizationId,
          userId: user.id,
        });
      } else {
        organizationId = requireOrganizationId(ctx);
        validatedProjectId = null;

        logger.info('Using organizationId from session', {
          organizationId,
          userId: user.id,
        });
      }

      const createdDevices = await createMultipleDevicesFromDiscovery(input.targets, organizationId, {
        ...input.options,
        projectId: validatedProjectId,
      });

      logger.info('Successfully created devices from discovery', {
        organizationId,
        createdCount: createdDevices.length,
        deviceIds: createdDevices.map((device: { id: string }) => device.id),
      });

      return {
        success: true,
        devices: createdDevices.map(transformDeviceForUI),
        count: createdDevices.length,
      };
    }),
});
