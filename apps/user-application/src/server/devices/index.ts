/**
 * Device server utilities
 *
 * Server functions for SSR loaders (avoid external HTTP during SSR)
 * Client components use tRPC for data operations
 */

import { createServerFn } from '@tanstack/react-start';
import { getDevicesForTenant, validateProjectAccess, getOrganizationIdFromProject } from '@repo/data-ops';
import { getCurrentUser } from '@/server/utils/auth';
import { z } from 'zod';

const DeviceListInputSchema = z.object({
  verificationStatus: z
    .union([
      z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']),
      z.array(z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']))
    ])
    .optional(),
  projectId: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

/**
 * Server function for device list (used in SSR loaders)
 */
export const getDeviceList = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => DeviceListInputSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();

    if (!user?.organizationId) {
      throw new Error('User has no organizations');
    }

    let organizationId = user.organizationId;
    let projectId: string | undefined;

    // If projectId provided, validate access
    if (data.projectId) {
      const derivedOrgId = await getOrganizationIdFromProject(data.projectId);
      if (!derivedOrgId) {
        throw new Error('Project not found');
      }

      const access = await validateProjectAccess(user.id, data.projectId, derivedOrgId);
      if (!access) {
        throw new Error('Project not found or access denied');
      }

      organizationId = access.organization.id;
      projectId = access.project.id;
    }

    return getDevicesForTenant(organizationId, {
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 50,
      sortColumn: 'discoveredAt',
      sortDirection: 'desc',
      verificationStatus: data.verificationStatus,
      projectId,
    });
  });

// Transform utilities
export { transformDeviceForUI } from './transforms';

// Type exports from contracts (single source of truth)
export type {
  TransformedDevice,
  DeviceOperationResult,
  DevicesListResult,
  DeviceDetailResult,
  DeviceVulnerability,
  DeviceVulnerabilitiesResult,
  DeleteDeviceResult,
  DiscoveryDevicesResult,
  CreateDevicesResult,
  UpdateDeviceResult,
  VerifyDeviceResult,
  DeviceScanHistoryResult,
  ToggleDeviceVerificationResult,
  StartDeviceScanResult,
} from '@repo/contracts/device';

// Scan preset utilities
export * from './scan-presets';
