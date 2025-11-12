import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { StartDiscoverySchema } from '../schemas/discovery-schemas';
import { getRestateHttpClient } from '../../utils/restate-http-client';
import { generateWorkflowId } from '../utils/workflow-helpers';
import { getCurrentOrganizationId, getCurrentUser } from '../../utils/auth';
import {
  createScanRun,
  getScanRunByRestateWorkflowId,
} from '@repo/data-ops';
import type {
  DiscoveryWorkflowStartResult,
  DiscoveryWorkflowStatusResult,
  DiscoveryWorkflowResultsResult,
} from './types';

const logger = createLogger({ name: 'discovery-handler' });

logger.info('Discovery handler initialized', {
  engine: 'Restate',
  restateUrl: process.env.RESTATE_INGRESS_URL || 'http://localhost:8080',
});

export const startDiscoveryWorkflow = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => {
    logger.info('Discovery input validation', { data });
    const result = StartDiscoverySchema.safeParse(data);
    if (!result.success) {
      const message = result.error?.issues?.map((err) => err.message).join(', ') || 'Validation failed';
      logger.error('Discovery input validation failed', { data, error: result.error });
      throw new Error(`Invalid input: ${message}`);
    }
    return result.data;
  })
  .handler(async ({ data }): Promise<DiscoveryWorkflowStartResult> => {
    const { target } = data;

    try {
      // Get organization and user from session
      const organizationId = await getCurrentOrganizationId();
      const currentUser = await getCurrentUser();

      logger.info('Starting discovery workflow', {
        target,
        organizationId,
        userId: currentUser.id,
        engine: 'Restate',
      });

      // Generate scanId for workflow key (deterministic pattern)
      const scanId = generateWorkflowId('discovery', target);

      // Create scan run with embedded workflow tracking
      const scanRun = await createScanRun({
        organizationId,
        restateWorkflowId: scanId,
        workflowKind: 'DISCOVERY',
        scanType: 'DISCOVERY',
        scope: 'EXTERNAL',
        requestedById: currentUser.id,
        target,
      });

      logger.info('Created scan run with workflow tracking', {
        scanId,
        scanRunId: scanRun.id,
        target,
        organizationId,
      });

      // Step 3: Build callback URL for postback
      const baseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
      const callbackUrl = `${baseUrl}/api/internal/scan-results`;

      logger.info('Generated callback URL for discovery postback', {
        callbackUrl,
        scanId,
        organizationId,
      });

      // Step 4: Call Discovery workflow's run handler (async with auth)
      const client = getRestateHttpClient();
      await client.startDiscovery({
        scanId,
        targets: [
          {
            type: 'DOMAIN',
            value: target,
            scope: 'EXTERNAL',
          },
        ],
        tools: ['subfinder'],
        callbackUrl,
        organizationId,
      });

      return {
        success: true,
        scanId, // Restate workflow key
        scanRunId: scanRun.id,
        target,
        message: `Discovery started for ${target}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to start discovery workflow', {
        target,
        error: errorMessage,
      });

      // Provide user-friendly error messages
      const friendlyMessage = errorMessage.includes('ECONNREFUSED')
        ? 'Discovery service is not available. Please ensure the Restate worker is running.'
        : errorMessage.includes('fetch failed')
        ? 'Unable to connect to discovery service. Check RESTATE_INGRESS_URL configuration.'
        : errorMessage;

      return {
        success: false,
        error: friendlyMessage,
        target,
      };
    }
  });

/**
 * Get scan workflow status from database (replaces Restate polling)
 *
 * This is the new database-first approach. The UI polls this endpoint
 * instead of polling Restate directly. The postback handler updates
 * the database when results are ready.
 */
export const getScanWorkflowStatusDB = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanId: string }) => {
    if (!data?.scanId) {
      throw new Error('Scan ID is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<DiscoveryWorkflowStatusResult> => {
    const { scanId } = data;

    try {
      const organizationId = await getCurrentOrganizationId();

      // Get scan run from database (workflow data is now embedded)
      const scanRun = await getScanRunByRestateWorkflowId(organizationId, scanId);

      if (!scanRun) {
        logger.warn('Scan run not found in database', { scanId, organizationId });
        return {
          scanId,
          status: 'UNKNOWN',
          error: 'Scan run not found',
        };
      }

      const resultSummary = scanRun.resultSummary as any;

      logger.info('Retrieved scan run status from database', {
        scanId,
        workflowStatus: scanRun.workflowStatus,
        scanRunStatus: scanRun.status,
        devicesFound: resultSummary?.createdDevices || 0,
      });

      // Map database status to UI status
      const statusMap: Record<string, string> = {
        PENDING: 'RUNNING',
        RUNNING: 'RUNNING',
        SUCCEEDED: 'COMPLETED',
        FAILED: 'FAILED',
        CANCELED: 'FAILED',
        TIMEOUT: 'FAILED',
      };

      const status = statusMap[scanRun.workflowStatus] || 'RUNNING';

      return {
        scanId,
        status,
        workflowStatus: scanRun.workflowStatus,
        isRunning: status === 'RUNNING',
        isCompleted: status === 'COMPLETED',
        isFailed: status === 'FAILED',
        devicesFound: resultSummary?.createdDevices || resultSummary?.discoveredDevices || 0,
        processedTargets: resultSummary?.target ? 1 : 0,
      };
    } catch (error) {
      logger.error('Failed to get scan run status from database', { scanId, error });
      return {
        scanId,
        status: 'UNKNOWN',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

/**
 * Get scan workflow results from database (replaces Restate result fetching)
 *
 * This fetches the final results from the database scan run's resultSummary
 * field, which is populated by the postback handler when discovery completes.
 */
export const getScanWorkflowResultsDB = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanId: string }) => {
    if (!data?.scanId) {
      throw new Error('Scan ID is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<DiscoveryWorkflowResultsResult> => {
    const { scanId } = data;

    try {
      const organizationId = await getCurrentOrganizationId();

      // Get scan run from database (workflow data is now embedded)
      const scanRun = await getScanRunByRestateWorkflowId(organizationId, scanId);

      if (!scanRun) {
        return {
          success: false,
          error: 'Scan run not found',
        };
      }

      // Extract devices from result summary (populated by postback handler)
      const resultSummary = scanRun.resultSummary as any;
      const target = resultSummary?.target || scanRun.target || 'unknown';

      // The postback handler stores devices in this format:
      // { target, totalSubdomains, discoveredDevices, createdDevices, devices: [...] }
      const devices = resultSummary?.devices || [];

      logger.info('Retrieved discovery workflow results from database', {
        scanId,
        totalDevices: devices.length,
        target,
      });

      // Map to the format expected by the UI (matches Restate format)
      const results = devices.map((device: any) => ({
        host: device.hostname,
        ip: device.ipAddress || '',
      }));

      const subdomains = devices
        .filter((d: any) => d.hostname && d.hostname.length > 0)
        .map((d: any) => d.hostname);

      return {
        success: true,
        result: {
          request: {
            target,
            scanType: 'basic',
            tools: resultSummary?.tools || ['subfinder'],
          },
          results: [
            {
              target,
              subdomains,
              results,
              tool: 'restate-scanner',
              timestamp: resultSummary?.completedAt || new Date().toISOString(),
              success: !resultSummary?.errors || resultSummary.errors.length === 0,
              errors: resultSummary?.errors || undefined,
            },
          ],
          totalSubdomains: results.length,
          uniqueSubdomains: results.map((entry: { host: string; ip: string }) => ({
            subdomain: entry.host,
            ip: entry.ip,
          })),
          executionTime: resultSummary?.executionTime || 0,
          errors: resultSummary?.errors || undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to get workflow results from database', {
        scanId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
