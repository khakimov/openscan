import type { DiscoveryRequest } from '@repo/temporal/types';
import type { ScannerInput } from '@repo/contracts';
import { createLogger } from '@repo/logger';
import { getTemporalHttpClient } from '../../utils/temporal-http-client';

const logger = createLogger({ name: 'discovery-workflow-orchestrator-http' });

export class WorkflowOrchestratorHttp {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async startDiscovery(request: DiscoveryRequest) {
    const client = getTemporalHttpClient(this.apiKey);

    const handle = await client.startDiscoveryWorkflow(request);

    logger.info('Discovery workflow started via HTTP', {
      target: request.target,
      workflowId: handle.workflowId,
    });

    return handle;
  }

  async startPortScan(input: ScannerInput, workflowId: string) {
    const client = getTemporalHttpClient(this.apiKey);

    const handle = await client.startPortScanWorkflow(input, workflowId);

    logger.info('Port scan workflow started via HTTP', {
      workflowId: handle.workflowId,
      scanRunId: input.scanRunId,
    });

    return handle;
  }

  async describeWorkflow(workflowId: string, runId?: string) {
    const client = getTemporalHttpClient(this.apiKey);
    const description = await client.describeWorkflow(workflowId, runId);

    return {
      status: {
        name: description.status,
      },
    };
  }

  async fetchDiscoveryResult(workflowId: string, runId?: string) {
    const client = getTemporalHttpClient(this.apiKey);
    return client.getWorkflowResult(workflowId, runId);
  }
}

// Helper function to create orchestrator with API key
export function getWorkflowOrchestrator(apiKey?: string): WorkflowOrchestratorHttp {
  return new WorkflowOrchestratorHttp(apiKey);
}

// Default export for backward compatibility (use getWorkflowOrchestrator in production)
export const workflowOrchestratorHttp = new WorkflowOrchestratorHttp();
