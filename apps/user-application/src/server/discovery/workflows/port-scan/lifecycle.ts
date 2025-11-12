import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { CancelPortScanSchema } from '../../schemas/port-scan-schemas';
import { portScanService } from '../../services/port-scan-service';
import { extractErrorMessage } from '../../utils/workflow-helpers';
import type { CancelPortScanResult, PortScanStateResult } from '../types';

const logger = createLogger({ name: 'discovery-port-scan-lifecycle' });

export const cancelPortScanWorkflowExecution = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => CancelPortScanSchema.parse(data))
  .handler(async ({ data }): Promise<CancelPortScanResult> => {
    const { scanId, scanRunId, reason } = data as {
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

      // Use port scan service for cancellation (handles Restate + database)
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
  });

export const getPortScanState = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { scanId: string }) => {
    if (!data?.scanId) {
      throw new Error('Scan ID is required');
    }
    return data;
  })
  .handler(async ({ data }): Promise<PortScanStateResult> => {
    const { scanId } = data;

    try {
      // Use port scan service to get state from Restate
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
  });
