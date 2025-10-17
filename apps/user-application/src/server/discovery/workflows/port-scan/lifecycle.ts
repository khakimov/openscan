import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { CancelPortScanSchema } from '../../schemas/port-scan-schemas';
import { portScanService } from '../../services/port-scan-service';
import { extractErrorMessage } from '../../utils/workflow-helpers';

const logger = createLogger({ name: 'discovery-port-scan-lifecycle' });

export const cancelPortScanWorkflowExecution = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => CancelPortScanSchema.parse(data))
  .handler(async ({ data }) => {
    const { workflowId, scanRunId, reason } = data as {
      workflowId: string;
      scanRunId?: string;
      reason?: string;
    };

    try {
      logger.info('Cancel port scan request received', {
        workflowId,
        scanRunId,
        hasReason: Boolean(reason),
      });

      // Use port scan service for cancellation (handles Restate + database)
      await portScanService.cancelScan({
        scanId: workflowId,
        scanRunId,
        reason,
      });

      return {
        success: true,
        workflowId,
        scanRunId,
        status: 'canceled',
      };
    } catch (error) {
      const message = extractErrorMessage(error);

      logger.error('Failed to cancel port scan', {
        workflowId,
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
  .inputValidator((data: { workflowId: string }) => {
    if (!data?.workflowId) {
      throw new Error('Workflow ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { workflowId } = data;

    try {
      // Use port scan service to get state from Restate
      const state = await portScanService.getScanState(workflowId);

      return {
        success: true,
        state: {
          scanId: state.scanId,
          status: state.status,
          message: state.message,
        },
      };
    } catch (error) {
      const message = extractErrorMessage(error);

      logger.error('Failed to query port scan state', {
        workflowId,
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
