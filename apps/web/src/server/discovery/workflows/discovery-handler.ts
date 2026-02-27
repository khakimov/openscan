import { createLogger } from '@repo/logger';

import { StartDiscoverySchema } from '../schemas/discovery-schemas';
import { getRestateHttpClient } from '../../utils/restate-http-client';
import { generateWorkflowId } from '../utils/workflow-helpers';
import {
  createScanRun,
  getScanRunByRestateWorkflowId,
} from '@repo/data-ops';
import type {
  DiscoveryWorkflowStartResult,
  DiscoveryWorkflowStatusResult,
  DiscoveryWorkflowResultsResult,
} from './types';
import { normalizeDiscoveryResult } from '@/features/discovery/utils/normalize-workflow-results';

const logger = createLogger({ name: 'discovery-handler' });

export async function startDiscoveryWorkflow({
  data,
}: {
  data: {
    target: string;
    organizationId: string;
    userId: string;
  };
}): Promise<DiscoveryWorkflowStartResult> {
  logger.info('Discovery input validation', { data });
  const result = StartDiscoverySchema.safeParse(data);
  if (!result.success) {
    const message =
      result.error?.issues?.map((err) => err.message).join(', ') ||
      'Validation failed';
    logger.error('Discovery input validation failed', {
      data,
      error: result.error,
    });
    throw new Error(`Invalid input: ${message}`);
  }

  const { target } = data;
  const organizationId = data.organizationId;
  const userId = data.userId;

  try {
    logger.info('Starting discovery workflow', {
      target,
      organizationId,
      userId,
      engine: 'Restate',
    });

    const scanId = generateWorkflowId('discovery', target);

    const scanRun = await createScanRun({
      organizationId,
      restateWorkflowId: scanId,
      workflowKind: 'DISCOVERY',
      scanType: 'DISCOVERY',
      scope: 'EXTERNAL',
      requestedById: userId,
      target,
    });

    logger.info('Created scan run with workflow tracking', {
      scanId,
      scanRunId: scanRun.id,
      target,
      organizationId,
    });

    const baseUrl =
      process.env.APP_URL ||
      process.env.BETTER_AUTH_URL ||
      'http://localhost:3000';
    const callbackUrl = `${baseUrl}/api/internal/scan-results`;

    logger.info('Generated callback URL for discovery postback', {
      callbackUrl,
      scanId,
      organizationId,
    });

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
      scanId,
      scanRunId: scanRun.id,
      target,
      message: `Discovery started for ${target}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error('Failed to start discovery workflow', {
      target,
      error: errorMessage,
    });

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
}

/**
 * Get scan workflow status from database
 */
export async function getScanWorkflowStatusDB({
  data,
}: {
  data: { scanId: string; organizationId: string };
}): Promise<DiscoveryWorkflowStatusResult> {
  const { scanId, organizationId } = data;

  try {
    const scanRun = await getScanRunByRestateWorkflowId(
      organizationId,
      scanId
    );

    if (!scanRun) {
      logger.warn('Scan run not found in database', {
        scanId,
        organizationId,
      });
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
      devicesFound:
        resultSummary?.createdDevices ||
        resultSummary?.discoveredDevices ||
        0,
      processedTargets: resultSummary?.target ? 1 : 0,
    };
  } catch (error) {
    logger.error('Failed to get scan run status from database', {
      scanId,
      error,
    });
    return {
      scanId,
      status: 'UNKNOWN',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get scan workflow results from database
 */
export async function getScanWorkflowResultsDB({
  data,
}: {
  data: { scanId: string; organizationId: string };
}): Promise<DiscoveryWorkflowResultsResult> {
  const { scanId, organizationId } = data;

  try {
    const scanRun = await getScanRunByRestateWorkflowId(
      organizationId,
      scanId
    );

    if (!scanRun) {
      return {
        success: false,
        error: 'Scan run not found',
      };
    }

    const normalizedResult = normalizeDiscoveryResult(
      scanRun.resultSummary,
      scanRun.target || undefined
    );

    logger.info('Retrieved discovery workflow results from database', {
      scanId,
      totalDevices: normalizedResult.totalSubdomains,
      target: normalizedResult.request.target,
    });

    return {
      success: true,
      result: normalizedResult,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error('Failed to get workflow results from database', {
      scanId,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
