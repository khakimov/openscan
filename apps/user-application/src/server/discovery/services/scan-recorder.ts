import {
  createScanRun,
  createScanWorkflow,
  getScanRunWithWorkflow,
  updateScanRunStatus,
  updateScanWorkflowStatus,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';

import type { ScanScope } from '../utils/scan-scope';

type WorkflowStatus = 'RUNNING' | 'CANCELED' | 'COMPLETED' | 'FAILED';

const logger = createLogger({ name: 'discovery-scan-recorder' });

export class ScanRecorder {
  async createWorkflow(params: {
    tenantId: string;
    temporalWorkflowId: string;
    kind: 'DISCOVERY' | string;
  }) {
    const workflow = await createScanWorkflow(params);
    logger.info('Created scan workflow record', {
      workflowId: workflow.id,
      temporalWorkflowId: params.temporalWorkflowId,
      tenantId: params.tenantId,
    });
    return workflow;
  }

  async createRun(params: {
    workflowId: string;
    tenantId: string;
    scanType: string;
    scope: ScanScope;
    requestedById: string;
    target: string;
    targets: string[];
  }) {
    const run = await createScanRun(params);
    logger.info('Created scan run record', {
      scanRunId: run.id,
      workflowId: params.workflowId,
      target: params.target,
    });
    return run;
  }

  async markRunRunning(scanRunId: string) {
    await updateScanRunStatus(scanRunId, 'RUNNING');
    logger.info('Marked scan run as running', { scanRunId });
  }

  async updateWorkflowStatus(workflowId: string, status: WorkflowStatus, runId?: string) {
    await updateScanWorkflowStatus(workflowId, status, runId);
    logger.info('Updated scan workflow status', {
      workflowId,
      status,
      runId,
    });
  }

  async markRunCanceled(scanRunId: string, reason?: string) {
    await updateScanRunStatus(scanRunId, 'CANCELED', {
      reason: reason ?? 'Canceled by operator',
      canceledAt: new Date().toISOString(),
    });
    logger.info('Marked scan run canceled', { scanRunId });
  }

  async fetchRunWithWorkflow(scanRunId: string) {
    return getScanRunWithWorkflow(scanRunId);
  }
}

export const scanRecorder = new ScanRecorder();
