/**
 * Workflow Health Monitor (Narrow Scope)
 *
 * This service handles ONLY workflows that should have written terminal state
 * updates but failed to do so (e.g., worker crash, activity timeout).
 *
 * Scope:
 * - Workflows in RUNNING/PENDING state beyond their expected runtime + buffer
 * - Rate-limited Temporal queries (max 10 workflows per reconciliation run)
 * - Idempotent corrections with full audit logging
 *
 * NOT in scope:
 * - Actively running workflows (those are fine)
 * - Workflows with recent heartbeats (activity is alive)
 * - General workflow monitoring (Temporal UI handles that)
 */

import { createLogger } from '@repo/logger';
import { db } from '@repo/data-ops/client';
import { scanWorkflows, scanRuns } from '@repo/data-ops/schema/orchestration';
import { eq, and, lt, inArray, sql } from '@repo/data-ops';
import { getTemporalClient } from '../utils/temporal-client';
import { WorkflowNotFoundError } from '@temporalio/client';

const logger = createLogger({ name: 'workflow-health-monitor' });

interface WorkflowHealthIssue {
  workflowId: string;
  temporalId: string;
  issueType: 'not_found' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  dbStatus: string;
  temporalStatus?: string;
  details?: string;
}

interface ReconciliationResult {
  checked: number;
  fixed: number;
  issues: WorkflowHealthIssue[];
}

/**
 * Maximum expected duration for port scans (in milliseconds)
 * Buffer = runTimeout (1 hour) + 15 minute grace period
 */
const PORT_SCAN_TIMEOUT_MS = 75 * 60 * 1000; // 1h 15min

/**
 * Maximum workflows to check per reconciliation run (rate limiting)
 */
const MAX_WORKFLOWS_PER_RUN = 10;

/**
 * Check and reconcile stuck workflow health (narrow scope)
 *
 * Only checks workflows that are:
 * 1. In RUNNING/PENDING state
 * 2. Started beyond expected runtime + buffer
 * 3. Rate-limited to 10 workflows per run
 *
 * @param fixIssues - Whether to fix issues (default: true)
 */
export async function reconcileWorkflowHealth(
  fixIssues: boolean = true
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    checked: 0,
    fixed: 0,
    issues: [],
  };

  try {
    const client = getTemporalClient();
    const cutoffTime = new Date(Date.now() - PORT_SCAN_TIMEOUT_MS);

    // Find workflows that SHOULD have finished but are still RUNNING/PENDING
    // Rate-limit to 10 workflows per run to avoid overwhelming Temporal
    const stuckWorkflows = await db
      .select()
      .from(scanWorkflows)
      .where(
        and(
          inArray(scanWorkflows.status, ['RUNNING', 'PENDING']),
          lt(scanWorkflows.startedAt, cutoffTime)
        )
      )
      .limit(MAX_WORKFLOWS_PER_RUN);

    result.checked = stuckWorkflows.length;

    if (stuckWorkflows.length === 0) {
      logger.debug('No stuck workflows found');
      return result;
    }

    logger.info('Starting narrow workflow health check', {
      workflowCount: stuckWorkflows.length,
      cutoffTime: cutoffTime.toISOString(),
      timeoutMs: PORT_SCAN_TIMEOUT_MS,
      fixIssues,
    });

    for (const workflow of stuckWorkflows) {
      try {
        // Query Temporal ONE LAST TIME before marking as timeout
        // Use idiomatic Temporal pattern: getHandle(workflowId, { runId })
        const handle = client.workflow.getHandle(workflow.temporalId, {
          runId: workflow.temporalRunId ?? undefined,
        });
        const description = await handle.describe();
        const temporalStatus = description.status.name;

        logger.info('Verified workflow state in Temporal', {
          workflowId: workflow.id,
          temporalId: workflow.temporalId,
          dbStatus: workflow.status,
          temporalStatus,
        });

        if (temporalStatus === 'COMPLETED' && workflow.status === 'RUNNING') {
          result.issues.push({
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            issueType: 'completed',
            dbStatus: workflow.status,
            temporalStatus,
            details: 'Workflow completed in Temporal but still RUNNING in database',
          });

          if (fixIssues) {
            await markWorkflowCompleted(workflow.id, workflow.temporalId);
            result.fixed++;
          }
        } else if (temporalStatus === 'FAILED' && workflow.status === 'RUNNING') {
          result.issues.push({
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            issueType: 'failed',
            dbStatus: workflow.status,
            temporalStatus,
            details: 'Workflow failed in Temporal but still RUNNING in database',
          });

          if (fixIssues) {
            await markWorkflowFailed(
              workflow.id,
              workflow.temporalId,
              'Workflow failed in Temporal - reconciled by health monitor'
            );
            result.fixed++;
          }
        } else if (temporalStatus === 'CANCELLED' && workflow.status === 'RUNNING') {
          result.issues.push({
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            issueType: 'cancelled',
            dbStatus: workflow.status,
            temporalStatus,
            details: 'Workflow cancelled in Temporal but still RUNNING in database',
          });

          if (fixIssues) {
            await markWorkflowCancelled(workflow.id, workflow.temporalId);
            result.fixed++;
          }
        } else if (temporalStatus === 'RUNNING') {
          // Workflow is legitimately still running in Temporal
          // This means our timeout calculation was wrong or it's a legitimate long-runner
          const startedAt = workflow.startedAt ? new Date(workflow.startedAt).getTime() : null;
          const durationMinutes = startedAt ? Math.round((Date.now() - startedAt) / 1000 / 60) : 0;

          logger.warn('Workflow legitimately still running beyond expected timeout', {
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            durationMinutes,
            expectedTimeoutMinutes: Math.round(PORT_SCAN_TIMEOUT_MS / 1000 / 60),
          });

          result.issues.push({
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            issueType: 'timeout',
            dbStatus: workflow.status,
            temporalStatus,
            details: `Workflow legitimately running for ${durationMinutes} minutes (exceeds expected ${Math.round(PORT_SCAN_TIMEOUT_MS / 1000 / 60)}min timeout)`,
          });

          // Don't auto-fix - this is a legit long-runner
          // Temporal will handle actual timeouts via runTimeout config
        }
      } catch (error) {
        // Workflow not found in Temporal
        if (error instanceof WorkflowNotFoundError) {
          result.issues.push({
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            issueType: 'not_found',
            dbStatus: workflow.status,
            details: 'Workflow not found in Temporal - likely expired or never started',
          });

          if (fixIssues) {
            await markWorkflowFailed(
              workflow.id,
              workflow.temporalId,
              'Workflow not found in Temporal - reconciled by health monitor'
            );
            result.fixed++;
          }
        } else {
          logger.warn('Failed to check workflow health', {
            workflowId: workflow.id,
            temporalId: workflow.temporalId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    logger.info('Workflow health reconciliation completed', {
      checked: result.checked,
      issuesFound: result.issues.length,
      fixed: result.fixed,
    });

    return result;
  } catch (error) {
    logger.error('Workflow health reconciliation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Mark a workflow as completed in the database (idempotent, with full audit logging)
 */
async function markWorkflowCompleted(workflowId: string, temporalId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Update workflow status
    await tx
      .update(scanWorkflows)
      .set({
        status: 'COMPLETED',
        finishedAt: new Date(),
        metadata: sql`jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()},
          'reason', 'temporal-state-mismatch',
          'previousStatus', status
        )`,
      })
      .where(eq(scanWorkflows.id, workflowId));

    // Update associated scan runs
    await tx
      .update(scanRuns)
      .set({
        status: 'COMPLETED',
        completedAt: new Date(),
        resultSummary: sql`COALESCE(result_summary, '{}'::jsonb) || jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()}
        )`,
      })
      .where(
        and(
          eq(scanRuns.workflowId, workflowId),
          inArray(scanRuns.status, ['RUNNING', 'PENDING'])
        )
      );
  });

  logger.info('Reconciled workflow as completed', {
    workflowId,
    temporalId,
    action: 'mark-completed',
    source: 'health-monitor',
  });
}

/**
 * Mark a workflow as failed in the database (idempotent, with full audit logging)
 */
async function markWorkflowFailed(
  workflowId: string,
  temporalId: string,
  reason: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Update workflow status
    await tx
      .update(scanWorkflows)
      .set({
        status: 'FAILED',
        finishedAt: new Date(),
        metadata: sql`jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()},
          'reason', ${reason},
          'previousStatus', status
        )`,
      })
      .where(eq(scanWorkflows.id, workflowId));

    // Update associated scan runs
    await tx
      .update(scanRuns)
      .set({
        status: 'FAILED',
        completedAt: new Date(),
        resultSummary: sql`COALESCE(result_summary, '{}'::jsonb) || jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()},
          'error', ${reason}
        )`,
      })
      .where(
        and(
          eq(scanRuns.workflowId, workflowId),
          inArray(scanRuns.status, ['RUNNING', 'PENDING'])
        )
      );
  });

  logger.info('Reconciled workflow as failed', {
    workflowId,
    temporalId,
    reason,
    action: 'mark-failed',
    source: 'health-monitor',
  });
}

/**
 * Mark a workflow as cancelled in the database (idempotent, with full audit logging)
 */
async function markWorkflowCancelled(workflowId: string, temporalId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Update workflow status (use CANCELED not CANCELLED to match enum)
    await tx
      .update(scanWorkflows)
      .set({
        status: 'CANCELED',
        finishedAt: new Date(),
        metadata: sql`jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()},
          'reason', 'temporal-state-mismatch',
          'previousStatus', status
        )`,
      })
      .where(eq(scanWorkflows.id, workflowId));

    // Update associated scan runs
    await tx
      .update(scanRuns)
      .set({
        status: 'FAILED', // scanRuns doesn't have CANCELLED, use FAILED
        completedAt: new Date(),
        resultSummary: sql`COALESCE(result_summary, '{}'::jsonb) || jsonb_build_object(
          'reconciledBy', 'health-monitor',
          'reconciledAt', ${new Date().toISOString()},
          'cancelled', true
        )`,
      })
      .where(
        and(
          eq(scanRuns.workflowId, workflowId),
          inArray(scanRuns.status, ['RUNNING', 'PENDING'])
        )
      );
  });

  logger.info('Reconciled workflow as cancelled', {
    workflowId,
    temporalId,
    action: 'mark-cancelled',
    source: 'health-monitor',
  });
}

