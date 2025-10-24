import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { getDb, scanRuns, eq } from '@repo/data-ops';

import { getCurrentOrganizationId } from '../../utils/auth';
import { extractErrorMessage } from '../utils/workflow-helpers';

const logger = createLogger({ name: 'discovery-workflow-history' });

export const getCompletedScans = createServerFn({
  method: 'GET',
})
  .handler(async () => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const db = getDb();

      // Query completed scan runs from database (workflow data is now embedded)
      const runs = await db
        .select()
        .from(scanRuns)
        .where(eq(scanRuns.organizationId, organizationId));

      const payload = runs
        .filter((r: any) => r.workflowStatus === 'SUCCEEDED' || r.workflowStatus === 'FAILED')
        .map((run: any) => ({
          scanId: run.restateWorkflowId, // Restate workflow key
          workflowType: run.workflowKind,
          scanType: run.workflowKind,
          status: run.workflowStatus.toLowerCase(),
          startTime: run.workflowStartedAt?.toISOString(),
          closeTime: run.workflowFinishedAt?.toISOString(),
          runId: run.restateWorkflowId, // Same as scanId
          result: null, // Result would need to be fetched separately if needed
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
