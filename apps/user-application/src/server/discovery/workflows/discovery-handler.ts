import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { StartDiscoverySchema } from '../schemas/discovery-schemas';
import { workflowOrchestratorHttp } from '../services/workflow-orchestrator-http';
import { buildDiscoveryRequest, buildDiscoveryResult, extractErrorMessage } from '../utils/workflow-helpers';

const logger = createLogger({ name: 'discovery-handler' });

export const startDiscoveryWorkflow = createServerFn({
  method: 'POST',
})
  .inputValidator((data: unknown) => {
    logger.info('Discovery input validation', { data });
    const result = StartDiscoverySchema.safeParse(data);
    if (!result.success) {
      const message = result.error?.errors?.map((err) => err.message).join(', ') || 'Validation failed';
      logger.error('Discovery input validation failed', { data, error: result.error });
      throw new Error(`Invalid input: ${message}`);
    }
    return result.data;
  })
  .handler(async ({ data }) => {
    const { target } = data;

    try {
      logger.info('Starting discovery workflow via HTTP', { target });

      const discoveryRequest = buildDiscoveryRequest(target);
      const handle = await workflowOrchestratorHttp.startDiscovery(discoveryRequest);

      return {
        success: true,
        workflowId: handle.workflowId,
        runId: handle.runId, // Include runId for status queries
        target,
        message: `Discovery started for ${target}`,
      };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);

      logger.error('Failed to start discovery workflow', {
        target,
        error: errorMessage,
      });

      // Check for CSP/Workers environment errors
      if (errorMessage.includes('Code generation from strings disallowed') ||
          errorMessage.includes('eval') ||
          errorMessage.includes('unsafe-eval')) {
        return {
          success: false,
          error: 'Discovery workflows require a Node.js runtime environment. The Cloudflare Workers environment does not support the Temporal client. Please run the application in Node.js mode or skip discovery for now.',
          target,
          errorType: 'RUNTIME_NOT_SUPPORTED',
        };
      }

      const friendlyMessage = errorMessage.includes('ECONNREFUSED')
        ? 'Discovery service is not available. Please ensure the worker is running.'
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
  .inputValidator((data: { workflowId: string; runId?: string }) => {
    if (!data?.workflowId) {
      throw new Error('Workflow ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { workflowId, runId } = data;

    try {
      const description = await workflowOrchestratorHttp.describeWorkflow(workflowId, runId);

      return {
        workflowId,
        status: description.status.name,
        isRunning: description.status.name === 'RUNNING',
        isCompleted: description.status.name === 'COMPLETED',
        isFailed: description.status.name === 'FAILED',
      };
    } catch (error) {
      logger.error('Failed to get workflow status', { workflowId, error });
      return {
        workflowId,
        status: 'UNKNOWN',
        error: extractErrorMessage(error),
      };
    }
  });

export const getWorkflowResult = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { workflowId: string; runId?: string }) => {
    if (!data?.workflowId) {
      throw new Error('Workflow ID is required');
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { workflowId, runId } = data;

    try {
      const discoveryOutput = await workflowOrchestratorHttp.fetchDiscoveryResult(workflowId, runId);
      const result = buildDiscoveryResult(discoveryOutput);

      logger.info('Retrieved discovery workflow result', {
        workflowId,
        totalSubdomains: result.totalSubdomains,
        uniqueSubdomains: result.uniqueSubdomains.length,
      });

      return {
        success: true,
        result,
      };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);

      logger.error('Failed to get workflow result', {
        workflowId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
