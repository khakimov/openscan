import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { scanRuns, scanRunDevices } from '../schema/orchestration';
import { devices } from '../schema/inventory';
import type { ScanRun, ScanScope } from '../types';

/**
 * Get all scan runs for an organization (workflow data is now embedded)
 * Optionally filter by projectId
 */
export async function getScanRunsWithArtifacts(
  organizationId: string,
  projectId?: string
): Promise<Array<ScanRun>> {
  const db = getDb();

  // If projectId is provided, filter scans by devices in that project
  if (projectId) {
    // Import projects schema to validate project belongs to organization
    const { projects } = await import('../schema/inventory');

    // Verify project belongs to organization (security check)
    const [project] = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      ))
      .limit(1);

    if (!project) {
      // Project doesn't exist or doesn't belong to this organization
      return [];
    }

    const results = await db
      .selectDistinct({
        id: scanRuns.id,
        organizationId: scanRuns.organizationId,
        restateWorkflowId: scanRuns.restateWorkflowId,
        workflowKind: scanRuns.workflowKind,
        workflowStatus: scanRuns.workflowStatus,
        workflowStartedAt: scanRuns.workflowStartedAt,
        workflowFinishedAt: scanRuns.workflowFinishedAt,
        workflowCancelRequestedAt: scanRuns.workflowCancelRequestedAt,
        workflowMetadata: scanRuns.workflowMetadata,
        scope: scanRuns.scope,
        scanType: scanRuns.scanType,
        target: scanRuns.target,
        requestedById: scanRuns.requestedById,
        requestedAt: scanRuns.requestedAt,
        startedAt: scanRuns.startedAt,
        completedAt: scanRuns.completedAt,
        status: scanRuns.status,
        resultSummary: scanRuns.resultSummary,
      })
      .from(scanRuns)
      .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
      .innerJoin(devices, eq(scanRunDevices.deviceId, devices.id))
      .where(and(
        eq(scanRuns.organizationId, organizationId),
        eq(devices.projectId, projectId)
      ))
      .orderBy(
        desc(scanRuns.completedAt),
        desc(scanRuns.startedAt),
        desc(scanRuns.requestedAt)
      );

    return results as Array<ScanRun>;
  }

  // Otherwise, return all scans for organization
  const results = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.organizationId, organizationId))
    .orderBy(
      desc(scanRuns.completedAt),
      desc(scanRuns.startedAt),
      desc(scanRuns.requestedAt)
    );

  return results;
}

/**
 * Create a new scan run with embedded workflow tracking
 */
export async function createScanRun(params: {
  organizationId: string;
  restateWorkflowId: string; // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
  workflowKind: 'DISCOVERY' | 'RESCAN' | 'EXTEND_SCAN' | 'BULK_IMPORT' | 'SYNC_QUALYS';
  scanType: 'DISCOVERY' | 'PORT' | 'WEB' | 'ADVANCED';
  scope: ScanScope;
  requestedById: string;
  target?: string;
  workflowMetadata?: Record<string, any>;
}): Promise<ScanRun> {
  const db = getDb();

  const [run] = await db
    .insert(scanRuns)
    .values({
      organizationId: params.organizationId,
      restateWorkflowId: params.restateWorkflowId,
      workflowKind: params.workflowKind,
      workflowStatus: 'PENDING',
      workflowMetadata: params.workflowMetadata,
      scanType: params.scanType,
      scope: params.scope,
      target: params.target,
      requestedById: params.requestedById,
      status: 'PENDING',
      resultSummary: null,
    })
    .returning();

  return run;
}

/**
 * Update scan workflow status (now part of scan run)
 */
export async function updateScanWorkflowStatus(
  scanRunId: string,
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'TIMEOUT'
): Promise<void> {
  const db = getDb();

  const updates: any = {
    workflowStatus: status,
  };

  // Set timestamps based on status
  if (status === 'RUNNING') {
    updates.workflowStartedAt = new Date();
  }
  if (['SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'].includes(status)) {
    updates.workflowFinishedAt = new Date();
  }

  await db
    .update(scanRuns)
    .set(updates)
    .where(eq(scanRuns.id, scanRunId));
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
 * Get scan run by Restate workflow ID
 */
export async function getScanRunByRestateWorkflowId(
  organizationId: string,
  restateWorkflowId: string
): Promise<ScanRun | null> {
  const db = getDb();

  const [scanRun] = await db
    .select()
    .from(scanRuns)
    .where(and(
      eq(scanRuns.organizationId, organizationId),
      eq(scanRuns.restateWorkflowId, restateWorkflowId)
    ));

  return scanRun || null;
}

/**
 * Get scan run by ID (workflow data is now embedded)
 */
export async function getScanRunById(
  scanRunId: string
): Promise<ScanRun | null> {
  const db = getDb();

  const [scanRun] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.id, scanRunId));

  return scanRun || null;
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
): Promise<Array<{ scanRun: ScanRun }>> {
  const db = getDb();

  const results = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(
      eq(scanRunDevices.deviceId, deviceId),
      eq(scanRunDevices.organizationId, organizationId),
      eq(scanRuns.workflowStatus, 'RUNNING')
    ));

  return results.map((result: any) => ({
    scanRun: result.scan_runs,
  }));
}
