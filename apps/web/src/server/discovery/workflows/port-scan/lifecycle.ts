import { createLogger } from '@repo/logger';

import { CancelPortScanSchema } from '../../schemas/port-scan-schemas';
import { portScanService } from '../../services/port-scan-service';
import { extractErrorMessage } from '../../utils/workflow-helpers';
import type { CancelPortScanResult, PortScanStateResult } from '../types';

const logger = createLogger({ name: 'discovery-port-scan-lifecycle' });

export async function cancelPortScanWorkflowExecution({
  data,
}: {
  data: { scanId: string; scanRunId?: string; reason?: string };
}): Promise<CancelPortScanResult> {
  const parsed = CancelPortScanSchema.parse(data);
  const { scanId, scanRunId, reason } = parsed as {
    scanId: string;
    scanRunId?: string;
    reason?: string;
  };

  try {
    logger.info('Cancel port scan request received', {
      scanId,
      scanRunId,
      hasReason: Boolean(reason),
    });

    await portScanService.cancelScan({
      scanId,
      scanRunId,
      reason,
    });

    return {
      success: true,
      scanId,
      scanRunId,
      status: 'canceled',
    };
  } catch (error) {
    const message = extractErrorMessage(error);

    logger.error('Failed to cancel port scan', {
      scanId,
      scanRunId,
      error: message,
    });

    return {
      success: false,
      error: message,
    };
  }
}

export async function getPortScanState({
  data,
}: {
  data: { scanId: string };
}): Promise<PortScanStateResult> {
  const { scanId } = data;

  if (!scanId) {
    throw new Error('Scan ID is required');
  }

  try {
    const state = await portScanService.getScanState(scanId);

    return {
      success: true,
      state: {
        scanId: state.scanId,
        status: state.status,
        message: state.message || '',
      },
    };
  } catch (error) {
    const message = extractErrorMessage(error);

    logger.error('Failed to query port scan state', {
      scanId,
      error: message,
    });

    return {
      success: false,
      error: message,
      errorType: 'QUERY_ERROR',
      shouldStopPolling: false,
    };
  }
}
