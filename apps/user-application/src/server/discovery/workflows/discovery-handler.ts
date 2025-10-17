import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { StartDiscoverySchema } from '../schemas/discovery-schemas';
import { sendToRestate, type DiscoveryState } from '../../../utils/restate-client';
import { generateWorkflowId } from '../utils/workflow-helpers';

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
  .handler(async ({ data }) => {
    const { target } = data;

    try {
      logger.info('Starting discovery workflow', {
        target,
        engine: 'Restate',
      });

      // Generate scanId for workflow key (deterministic pattern)
      const scanId = generateWorkflowId('discovery', target);

      // Call Discovery workflow's run handler (async)
      await sendToRestate({
        service: 'Discovery',
        key: scanId,
        method: 'run',
        data: {
          targets: [
            {
              type: 'DOMAIN',
              value: target,
              scope: 'EXTERNAL',
            },
          ],
          tools: ['subfinder'],
          scanId,
        },
        async: true, // Fire and forget - don't wait for completion
      });

      return {
        success: true,
        scanId, // Single ID following Restate pattern
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

export const getWorkflowStatus = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanId: string }) => {
    if (!data?.scanId) {
      throw new Error('Scan ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { scanId } = data;

    try {
      // Query workflow state using getState handler
      const state = await sendToRestate<DiscoveryState>({
        service: 'Discovery',
        key: scanId,
        method: 'getState',
      });

      // Map Restate phases to status
      const statusMap: Record<string, string> = {
        VALIDATING: 'RUNNING',
        DISCOVERING: 'RUNNING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
      };

      const status = statusMap[state.phase] || 'RUNNING';

      return {
        scanId,
        status,
        phase: state.phase,
        isRunning: status === 'RUNNING',
        isCompleted: status === 'COMPLETED',
        isFailed: status === 'FAILED',
        processedTargets: state.processedTargets,
        devicesFound: state.devicesFound,
      };
    } catch (error) {
      logger.error('Failed to get workflow status', { scanId, error });
      return {
        scanId,
        status: 'UNKNOWN',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

export const getWorkflowResult = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanId: string }) => {
    if (!data?.scanId) {
      throw new Error('Scan ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { scanId } = data;

    try {
      // Query workflow state to get final results
      const state = await sendToRestate<DiscoveryState>({
        service: 'Discovery',
        key: scanId,
        method: 'getState',
      });

      // Extract devices and build result format
      const devices = state.devices || [];
      const subdomains = devices
        .filter((d: any) => d.hostname && d.hostname.length > 0)
        .map((d: any) => d.hostname);

      const results = devices.map((device: any) => ({
        host: device.hostname,
        ip: device.ipAddress || '',
      }));

      const target = devices[0]?.metadata?.originalDomain || 'unknown';

      logger.info('Retrieved discovery workflow result', {
        scanId,
        totalDevices: devices.length,
        uniqueSubdomains: subdomains.length,
      });

      return {
        success: true,
        result: {
          request: {
            target,
            scanType: 'basic',
            tools: ['subfinder'],
          },
          results: [
            {
              target,
              subdomains,
              results,
              tool: 'restate-scanner',
              timestamp: state.completedAt || new Date().toISOString(),
              success: state.errors.length === 0,
              errors: state.errors.length > 0 ? state.errors : undefined,
            },
          ],
          totalSubdomains: results.length,
          uniqueSubdomains: results.map((entry: { host: string; ip: string }) => ({
            subdomain: entry.host,
            ip: entry.ip,
          })),
          executionTime: state.completedAt && state.startedAt
            ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
            : 0,
          errors: state.errors.length > 0 ? state.errors : undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to get workflow result', {
        scanId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
