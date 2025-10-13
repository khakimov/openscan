import { WorkflowExecutionAlreadyCompletedError, WorkflowNotFoundError } from '@temporalio/client';
import type { DiscoveryRequest } from '@repo/temporal/types';
import type { PortScanState, ScannerInput } from '@repo/contracts';
import { createLogger } from '@repo/logger';
import {
  getTemporalConnectionConfig,
  getWorkflowTimeoutConfig,
  getTemporalConfig
} from '@repo/config';

import { getTemporalClient } from '../../utils/temporal-client';

// Workflow names - must match the exported function names in worker
const DISCOVERY_WORKFLOW = 'discoveryWorkflow';
const PORTSCAN_WORKFLOW = 'portscanWorkflow';
const CANCEL_PORT_SCAN_SIGNAL = 'cancelPortScan';

const logger = createLogger({ name: 'discovery-workflow-orchestrator' });

export class WorkflowOrchestrator {
  async startDiscovery(request: DiscoveryRequest) {
    const client = getTemporalClient();
    const { taskQueue } = getTemporalConnectionConfig();
    const timeouts = getWorkflowTimeoutConfig();
    const workflowId = `discovery-${request.target}-${Date.now()}`;

    const handle = await client.workflow.start(DISCOVERY_WORKFLOW, {
      taskQueue,
      workflowId,
      args: [request],
      workflowRunTimeout: timeouts.workflowRunTimeout,
      workflowExecutionTimeout: timeouts.workflowExecutionTimeout,
      workflowTaskTimeout: timeouts.workflowTaskTimeout,
    });

    logger.info('Discovery workflow started', {
      target: request.target,
      workflowId: handle.workflowId,
    });

    return handle;
  }

  async describeWorkflow(workflowId: string) {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    return handle.describe();
  }

  async fetchDiscoveryResult(workflowId: string) {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    return handle.result();
  }

  async startPortScan(input: ScannerInput, workflowId: string) {
    const client = getTemporalClient();
    const { taskQueue } = getTemporalConnectionConfig();
    const timeouts = getWorkflowTimeoutConfig();

    const handle = await client.workflow.start(PORTSCAN_WORKFLOW, {
      taskQueue,
      workflowId,
      args: [input],
      workflowRunTimeout: timeouts.workflowRunTimeout,
      workflowExecutionTimeout: timeouts.workflowExecutionTimeout,
      workflowTaskTimeout: timeouts.workflowTaskTimeout,
    });

    logger.info('Port scan workflow started', {
      workflowId: handle.workflowId,
      scanRunId: input.scanRunId,
    });

    return handle;
  }

  async cancelPortScan(options: { workflowId: string; reason?: string }) {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(options.workflowId);

    let signalDelivered: 'delivered' | 'already_completed' = 'delivered';

    try {
      await handle.signal(CANCEL_PORT_SCAN_SIGNAL, { reason: options.reason });
      logger.info('Delivered cancel signal to workflow', {
        workflowId: options.workflowId,
      });
    } catch (error) {
      if (
        error instanceof WorkflowExecutionAlreadyCompletedError ||
        error instanceof WorkflowNotFoundError
      ) {
        signalDelivered = 'already_completed';
        logger.warn('Workflow finished before cancel signal was delivered', {
          workflowId: options.workflowId,
        });
      } else {
        throw error;
      }
    }

    try {
      await handle.cancel();
      logger.info('Requested workflow cancellation', { workflowId: options.workflowId });
    } catch (error) {
      if (
        error instanceof WorkflowExecutionAlreadyCompletedError ||
        error instanceof WorkflowNotFoundError
      ) {
        logger.warn('Workflow finished before cancellation request', {
          workflowId: options.workflowId,
        });
      } else {
        throw error;
      }
    }

    return { signalDelivered } as const;
  }

  async queryPortScanState(workflowId: string) {
    const client = getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    return handle.query<PortScanState>('getPortScanState');
  }

  async listCompletedScans(limit?: number) {
    const client = getTemporalClient();
    const { taskQueue } = getTemporalConnectionConfig();
    const config = getTemporalConfig();
    const effectiveLimit = limit ?? config.completedScansLimit;

    const listHandle = client.workflow.list({
      query: `TaskQueue="${taskQueue}" AND ExecutionStatus="Completed"`,
      pageSize: effectiveLimit,
    });

    const workflows: Array<{
      workflowId: string;
      workflowType?: string;
      runId?: string;
      result: unknown;
      description: Awaited<ReturnType<typeof this.describeWorkflow>>;
      scanType: 'discovery' | 'port' | 'unknown';
    }> = [];

    for await (const workflow of listHandle) {
      try {
        const handle = client.workflow.getHandle(workflow.workflowId, workflow.runId);
        const description = await handle.describe();

        let result: unknown = null;
        let scanType: 'discovery' | 'port' | 'unknown' = 'unknown';
        const actualWorkflowType = workflow.workflowType || description.type || description.workflowType;

        const inferredType = actualWorkflowType ?? (() => {
          if (workflow.workflowId.startsWith('discovery-')) return 'discoveryWorkflow';
          if (workflow.workflowId.startsWith('portscan-')) return 'portscanWorkflow';
          return undefined;
        })();

        if (inferredType === 'discoveryWorkflow') {
          scanType = 'discovery';
          try {
            result = await handle.result();
          } catch (error) {
            logger.warn('Failed to get discovery result', { workflowId: workflow.workflowId, error });
          }
        } else if (inferredType === 'portscanWorkflow') {
          scanType = 'port';
          try {
            result = await handle.result();
          } catch (error) {
            logger.warn('Failed to get port scan result', { workflowId: workflow.workflowId, error });
          }
        }

        workflows.push({
          workflowId: workflow.workflowId,
          workflowType: inferredType,
          runId: workflow.runId,
          result,
          description,
          scanType,
        });
      } catch (error) {
        logger.warn('Failed to describe workflow', { workflowId: workflow.workflowId, error });
      }
    }

    return workflows;
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();
export type CancelSignalResult = Awaited<ReturnType<WorkflowOrchestrator['cancelPortScan']>>;
