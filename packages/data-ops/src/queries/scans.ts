import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { scanRuns, scanWorkflows, scanRunDevices } from '../schema/orchestration';
import type { ScanRun, ScanWorkflow, ScanScope } from '../types';

/**
 * Get all scan runs for an organization with workflow information
 */
export async function getScanRunsWithArtifacts(
  organizationId: string
): Promise<Array<ScanRun & { scanId: string }>> {
  const db = getDb();

  const results = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanWorkflows, eq(scanRuns.scanWorkflowId, scanWorkflows.id))
    .where(eq(scanRuns.organizationId, organizationId))
    .orderBy(
      desc(scanRuns.completedAt),
      desc(scanRuns.startedAt),
      desc(scanRuns.requestedAt)
    );

  return results.map((result: any) => ({
    ...result.scan_runs,
    scanId: result.scan_workflows.scanId, // Add Restate workflow key
  }));
}

/**
 * Create a new scan workflow record to track Restate workflow
 */
export async function createScanWorkflow(params: {
  organizationId: string;
  scanId: string; // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
  kind: 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN' | 'BULK_IMPORT' | 'SYNC_QUALYS';
}): Promise<ScanWorkflow> {
  const db = getDb();

  const [workflow] = await db
    .insert(scanWorkflows)
    .values({
      organizationId: params.organizationId,
      scanId: params.scanId,
      kind: params.kind,
      status: 'PENDING',
    })
    .returning();

  return workflow;
}

/**
 * Create a new scan run record for a specific scan execution
 */
export async function createScanRun(params: {
  scanWorkflowId: string; // Foreign key to scanWorkflows.id (CUID)
  organizationId: string;
  scanType: 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED';
  scope: ScanScope;
  requestedById: string;
  target?: string;
}): Promise<ScanRun> {
  const db = getDb();

  const [run] = await db
    .insert(scanRuns)
    .values({
      scanWorkflowId: params.scanWorkflowId,
      organizationId: params.organizationId,
      scanType: params.scanType,
      scope: params.scope,
      target: params.target,
      requestedById: params.requestedById,
      status: 'PENDING',
      resultSummary: {},
    })
    .returning();

  return run;
}

/**
 * Update scan workflow status
 */
export async function updateScanWorkflowStatus(
  scanWorkflowId: string, // Database ID (CUID) not scanId
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT'
): Promise<void> {
  const db = getDb();

  const updates: any = {
    status,
  };

  // Set timestamps based on status
  if (status === 'RUNNING') {
    updates.startedAt = new Date();
  }
  if (['SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'].includes(status)) {
    updates.finishedAt = new Date();
  }

  await db
    .update(scanWorkflows)
    .set(updates)
    .where(eq(scanWorkflows.id, scanWorkflowId));
}

/**
 * Update scan run status with optional result summary
 */
export async function updateScanRunStatus(
  scanRunId: string,
  status: 'PENDING' | 'RUNNING' | 'PARTIAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT',
  resultSummary?: Record<string, any>
): Promise<void> {
  const db = getDb();

  const updates: any = {
    status,
  };

  // Set timestamps based on status
  if (status === 'RUNNING') {
    updates.startedAt = new Date();
  }
  if (['SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT', 'PARTIAL'].includes(status)) {
    updates.completedAt = new Date();
  }

  // Merge result summary if provided
  if (resultSummary) {
    const [currentRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.id, scanRunId));

    updates.resultSummary = {
      ...(currentRun?.resultSummary || {}),
      ...resultSummary,
    };

    console.log('[updateScanRunStatus] Merging result summary:', {
      scanRunId,
      currentResultSummary: currentRun?.resultSummary,
      newResultSummary: resultSummary,
      mergedResultSummary: updates.resultSummary,
      mergedKeys: Object.keys(updates.resultSummary || {}),
    });
  }

  await db
    .update(scanRuns)
    .set(updates)
    .where(eq(scanRuns.id, scanRunId));
}

/**
 * Get scan workflow by scanId (Restate workflow key)
 */
export async function getScanWorkflowByScanId(
  organizationId: string,
  scanId: string
): Promise<ScanWorkflow | null> {
  const db = getDb();

  const [workflow] = await db
    .select()
    .from(scanWorkflows)
    .where(and(
      eq(scanWorkflows.organizationId, organizationId),
      eq(scanWorkflows.scanId, scanId)
    ));

  return workflow || null;
}

/**
 * Get scan run with its workflow
 */
export async function getScanRunWithWorkflow(
  scanRunId: string
): Promise<(ScanRun & { workflow: ScanWorkflow }) | null> {
  const db = getDb();

  const [result] = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanWorkflows, eq(scanRuns.scanWorkflowId, scanWorkflows.id))
    .where(eq(scanRuns.id, scanRunId));

  if (!result) return null;

  return {
    ...result.scan_runs,
    workflow: result.scan_workflows,
  };
}

/**
 * Add device to scan run
 */
export async function addDeviceToScanRun(params: {
  scanRunId: string;
  deviceId: string;
  organizationId: string;
  role?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const db = getDb();

  await db
    .insert(scanRunDevices)
    .values({
      runId: params.scanRunId,
      deviceId: params.deviceId,
      organizationId: params.organizationId,
      role: params.role || 'TARGET',
      metadata: params.metadata || {},
    })
    .onConflictDoNothing();
}

/**
 * Get active scans for a specific device
 */
export async function getActiveScansForDevice(
  organizationId: string,
  deviceId: string
): Promise<Array<{ scanRun: ScanRun; workflow: ScanWorkflow }>> {
  const db = getDb();

  const results = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanWorkflows, eq(scanRuns.scanWorkflowId, scanWorkflows.id))
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(
      eq(scanRunDevices.deviceId, deviceId),
      eq(scanRunDevices.organizationId, organizationId),
      eq(scanWorkflows.status, 'RUNNING')
    ));

  return results.map((result: any) => ({
    scanRun: result.scan_runs,
    workflow: result.scan_workflows,
  }));
}
