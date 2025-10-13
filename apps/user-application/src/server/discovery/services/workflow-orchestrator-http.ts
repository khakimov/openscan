import type { DiscoveryRequest } from '@repo/temporal/types';
import { createLogger } from '@repo/logger';
import { getTemporalHttpClient } from '../../utils/temporal-http-client';

const logger = createLogger({ name: 'discovery-workflow-orchestrator-http' });

export class WorkflowOrchestratorHttp {
  async startDiscovery(request: DiscoveryRequest) {
    const client = getTemporalHttpClient();

    const handle = await client.startDiscoveryWorkflow(request);

    logger.info('Discovery workflow started via HTTP', {
      target: request.target,
      workflowId: handle.workflowId,
    });

    return handle;
  }

  async describeWorkflow(workflowId: string, runId?: string) {
    const client = getTemporalHttpClient();
    const description = await client.describeWorkflow(workflowId, runId);

    return {
      status: {
        name: description.status,
      },
    };
  }

  async fetchDiscoveryResult(workflowId: string, runId?: string) {
    const client = getTemporalHttpClient();
    return client.getWorkflowResult(workflowId, runId);
  }
}

export const workflowOrchestratorHttp = new WorkflowOrchestratorHttp();
