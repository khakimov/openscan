import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { WorkflowNotFoundError, WorkflowFailedError } from '@temporalio/client';
// WorkflowExecutionTerminatedError doesn't exist in @temporalio/client
// Use WorkflowFailedError for all failure cases

import { getCurrentTenant } from '../../../utils/auth';
import { CancelPortScanSchema } from '../../schemas/port-scan-schemas';
import { workflowOrchestrator } from '../../services/workflow-orchestrator';
import { workflowOrchestratorHttp } from '../../services/workflow-orchestrator-http';
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
      // Use HTTP client to describe workflow (gRPC queries not supported in Workers)
      const description = await workflowOrchestratorHttp.describeWorkflow(workflowId);

      // Map Temporal status to simple state
      const state = {
        status: description.status,
        workflowId: description.workflowId,
        runId: description.runId,
      };

      return {
        success: true,
        state,
      };
    } catch (error) {
      const message = extractErrorMessage(error);

      // Check if workflow not found
      if (message.includes('not found') || message.includes('404')) {
        logger.warn('Workflow not found in Temporal', {
          workflowId,
          error: message,
        });
        return {
          success: false,
          error: 'Workflow not found - likely expired or never started',
          errorType: 'WORKFLOW_NOT_FOUND',
          shouldStopPolling: true,
        };
      }

      // Check if workflow failed
      if (message.includes('failed') || message.includes('FAILED')) {
        logger.warn('Workflow execution failed', {
          workflowId,
          error: message,
        });
        return {
          success: false,
          error: 'Workflow execution failed',
          errorType: 'WORKFLOW_FAILED',
          shouldStopPolling: true,
        };
      }

      // Generic error
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
