import { createServerFn } from '@tanstack/react-start';
import { createLogger } from '@repo/logger';
import { getDb, scanWorkflows, eq } from '@repo/data-ops';

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

      // Query completed discovery workflows from database
      const workflows = await db
        .select()
        .from(scanWorkflows)
        .where(eq(scanWorkflows.organizationId, organizationId));

      const payload = workflows
        .filter((w: typeof workflows[number]) => w.status === 'SUCCEEDED' || w.status === 'FAILED')
        .map((workflow: typeof workflows[number]) => ({
          scanId: workflow.scanId, // Restate workflow key
          workflowType: workflow.kind,
          scanType: workflow.kind,
          status: workflow.status.toLowerCase(),
          startTime: workflow.startedAt?.toISOString(),
          closeTime: workflow.finishedAt?.toISOString(),
          runId: workflow.scanId, // Same as scanId for now
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
