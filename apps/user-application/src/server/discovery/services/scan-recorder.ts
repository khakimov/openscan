import {
  createScanRun,
  createScanWorkflow,
  getScanRunWithWorkflow,
  updateScanRunStatus,
  updateScanWorkflowStatus,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';

import type { ScanScope } from '../utils/scan-scope';

type WorkflowStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT';

const logger = createLogger({ name: 'discovery-scan-recorder' });

export class ScanRecorder {
  async createWorkflow(params: {
    tenantId: string;
    temporalWorkflowId: string;
    kind: 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN' | 'BULK_IMPORT' | 'SYNC_QUALYS';
  }) {
    const workflow = await createScanWorkflow({
      organizationId: params.tenantId,
      temporalWorkflowId: params.temporalWorkflowId,
      kind: params.kind,
    });
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
    scanType: 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED';
    scope: ScanScope;
    requestedById: string;
    target: string;
    targets: string[];
  }) {
    const run = await createScanRun({
      workflowId: params.workflowId,
      organizationId: params.tenantId,
      scanType: params.scanType,
      scope: params.scope,
      requestedById: params.requestedById,
      target: params.target,
    });
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
