import {
  createScanRun,
  getScanRunById,
  updateScanRunStatus,
  updateScanWorkflowStatus,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';

import type { ScanScope } from '../utils/scan-scope';

type WorkflowStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT';

const logger = createLogger({ name: 'discovery-scan-recorder' });

export class ScanRecorder {
  /**
   * Create a new scan run with embedded workflow tracking
   */
  async createRun(params: {
    tenantId: string;
    restateWorkflowId: string; // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
    workflowKind: 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN' | 'BULK_IMPORT' | 'SYNC_QUALYS';
    scanType: 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED';
    scope: ScanScope;
    requestedById: string;
    target: string;
    targets: string[];
    workflowMetadata?: Record<string, any>;
  }) {
    const run = await createScanRun({
      organizationId: params.tenantId,
      restateWorkflowId: params.restateWorkflowId,
      workflowKind: params.workflowKind,
      scanType: params.scanType,
      scope: params.scope,
      requestedById: params.requestedById,
      target: params.target,
      workflowMetadata: params.workflowMetadata,
    });
    logger.info('Created scan run with workflow tracking', {
      scanRunId: run.id,
      restateWorkflowId: params.restateWorkflowId,
      workflowKind: params.workflowKind,
      target: params.target,
    });
    return run;
  }

  async markRunRunning(scanRunId: string) {
    await updateScanRunStatus(scanRunId, 'RUNNING');
    logger.info('Marked scan run as running', { scanRunId });
  }

  async updateWorkflowStatus(scanRunId: string, status: WorkflowStatus) {
    await updateScanWorkflowStatus(scanRunId, status);
    logger.info('Updated workflow status', {
      scanRunId,
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

  async fetchRun(scanRunId: string) {
    return getScanRunById(scanRunId);
  }
}

export const scanRecorder = new ScanRecorder();
