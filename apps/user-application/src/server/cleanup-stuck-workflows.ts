/**
 * Cleanup utility for stuck workflows
 *
 * Marks workflows that have been RUNNING for too long as TIMEOUT
 */

import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { getDb, scanWorkflows, eq, and, sql } from '@repo/data-ops';
import { getCurrentTenant } from './utils/auth';

const logger = createLogger({ name: 'cleanup-stuck-workflows' });

export const cleanupStuckWorkflows = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { maxAgeMinutes?: number }) => data)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentTenant();
      const maxAgeMinutes = data.maxAgeMinutes || 30; // Default: workflows running for >30 minutes

      logger.info('Cleaning up stuck workflows', {
        organizationId,
        maxAgeMinutes,
      });

      const db = getDb();

      // Find workflows that have been RUNNING for more than maxAgeMinutes
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

      const result = await db
        .update(scanWorkflows)
        .set({
          status: 'TIMEOUT',
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(scanWorkflows.organizationId, organizationId),
            eq(scanWorkflows.status, 'RUNNING'),
            sql`${scanWorkflows.startedAt} < ${cutoffTime}`
          )
        )
        .returning();

      logger.info('Stuck workflows cleaned up', {
        count: result.length,
        workflowIds: result.map((w: typeof result[number]) => w.workflowId),
      });

      return {
        success: true,
        count: result.length,
        workflows: result.map((w: typeof result[number]) => ({
          id: w.id,
          workflowId: w.workflowId,
          kind: w.kind,
          startedAt: w.startedAt,
        })),
      };
    } catch (error) {
      logger.error('Failed to cleanup stuck workflows', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });

      throw error;
    }
  });
