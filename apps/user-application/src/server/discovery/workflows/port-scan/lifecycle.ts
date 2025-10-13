import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { WorkflowNotFoundError, WorkflowFailedError } from '@temporalio/client';
// WorkflowExecutionTerminatedError doesn't exist in @temporalio/client
// Use WorkflowFailedError for all failure cases

import { getCurrentTenant } from '../../../utils/auth';
import { CancelPortScanSchema } from '../../schemas/port-scan-schemas';
import { workflowOrchestrator } from '../../services/workflow-orchestrator';
import { scanRecorder } from '../../services/scan-recorder';
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

      await getCurrentTenant();

      const { signalDelivered } = await workflowOrchestrator.cancelPortScan({
        workflowId,
        reason,
      });

      if (scanRunId) {
        try {
          await scanRecorder.markRunCanceled(scanRunId, reason);

          const runWithWorkflow = await scanRecorder.fetchRunWithWorkflow(scanRunId);
          if (runWithWorkflow) {
            await scanRecorder.updateWorkflowStatus(runWithWorkflow.workflow.id, 'CANCELED');
          }

          logger.info('Marked scan run as canceled in orchestration store', {
            workflowId,
            scanRunId,
          });
        } catch (statusError) {
          logger.warn('Failed to update scan status during cancellation', {
            workflowId,
            scanRunId,
            error: extractErrorMessage(statusError),
          });
        }
      }

      return {
        success: true,
        workflowId,
        scanRunId,
        status: 'cancel-requested',
        signalDelivered,
      };
    } catch (error) {
      const message = extractErrorMessage(error);

      logger.error('Failed to cancel port scan workflow', {
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
      const state = await workflowOrchestrator.queryPortScanState(workflowId);
      return {
        success: true,
        state,
      };
    } catch (error) {
      // Distinguish between different Temporal failure modes
      if (error instanceof WorkflowNotFoundError) {
        logger.warn('Workflow not found in Temporal', {
          workflowId,
          error: extractErrorMessage(error),
        });
        return {
          success: false,
          error: 'Workflow not found - likely expired or never started',
          errorType: 'WORKFLOW_NOT_FOUND',
          shouldStopPolling: true,
        };
      }

      if (error instanceof WorkflowFailedError) {
        logger.warn('Workflow execution failed or terminated', {
          workflowId,
          error: extractErrorMessage(error),
        });
        return {
          success: false,
          error: 'Workflow execution failed',
          errorType: 'WORKFLOW_FAILED',
          shouldStopPolling: true,
        };
      }

      // Generic Temporal query timeout or network issue
      const message = extractErrorMessage(error);
      const isTimeout = message.toLowerCase().includes('timeout');

      logger.error('Failed to query workflow state', {
        workflowId,
        error: message,
        isTimeout,
      });

      return {
        success: false,
        error: message,
        errorType: isTimeout ? 'QUERY_TIMEOUT' : 'QUERY_ERROR',
        shouldStopPolling: false, // Allow retry for transient errors
      };
    }
  });
