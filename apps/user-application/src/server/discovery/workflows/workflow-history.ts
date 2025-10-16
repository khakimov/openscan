import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';

import { workflowOrchestratorRestate as workflowOrchestrator } from '../services/workflow-orchestrator-restate';
import { extractErrorMessage } from '../utils/workflow-helpers';

const logger = createLogger({ name: 'discovery-workflow-history' });

export const getCompletedScans = createServerFn({
  method: 'GET',
})
  .handler(async () => {
    try {
      const workflows = await workflowOrchestrator.listCompletedScans();

      const payload = workflows.map((workflow) => ({
        workflowId: workflow.workflowId,
        workflowType: workflow.workflowType,
        scanType: workflow.scanType,
        status: workflow.description.status.name.toLowerCase(),
        startTime: workflow.description.startTime,
        closeTime: workflow.description.closeTime,
        runId: workflow.runId,
        result: workflow.result,
      }));

      logger.info('Retrieved completed scans', { count: payload.length });

      return {
        success: true,
        workflows: payload,
      };
    } catch (error) {
      const message = extractErrorMessage(error);
      logger.error('Failed to get completed scans', { error: message });
      return {
        success: false,
        error: message,
        workflows: [],
      };
    }
  });
