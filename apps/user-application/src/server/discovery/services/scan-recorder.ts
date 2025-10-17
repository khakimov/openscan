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
    scanId: string; // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
    kind: 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN' | 'BULK_IMPORT' | 'SYNC_QUALYS';
  }) {
    const workflow = await createScanWorkflow({
      organizationId: params.tenantId,
      scanId: params.scanId,
      kind: params.kind,
    });
    logger.info('Created scan workflow record', {
      scanWorkflowId: workflow.id, // Database ID (CUID)
      restateScanId: params.scanId, // Restate workflow key
      tenantId: params.tenantId,
    });
    return workflow;
  }

  async createRun(params: {
    scanWorkflowId: string; // FK to scanWorkflows.id (CUID)
    tenantId: string;
    scanType: 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED';
    scope: ScanScope;
    requestedById: string;
    target: string;
    targets: string[];
  }) {
    const run = await createScanRun({
      scanWorkflowId: params.scanWorkflowId,
      organizationId: params.tenantId,
      scanType: params.scanType,
      scope: params.scope,
      requestedById: params.requestedById,
      target: params.target,
    });
    logger.info('Created scan run record', {
      scanRunId: run.id,
      scanWorkflowId: params.scanWorkflowId,
      target: params.target,
    });
    return run;
  }

  async markRunRunning(scanRunId: string) {
    await updateScanRunStatus(scanRunId, 'RUNNING');
    logger.info('Marked scan run as running', { scanRunId });
  }

  async updateWorkflowStatus(scanWorkflowId: string, status: WorkflowStatus) {
    await updateScanWorkflowStatus(scanWorkflowId, status);
    logger.info('Updated scan workflow status', {
      scanWorkflowId,
      status,
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
