/**
 * Workflow Orchestrator - Restate Implementation
 *
 * Replaces Temporal with Restate for discovery workflows.
 * Provides a compatible interface for easy migration.
 */

import type { DiscoveryRequest } from '@repo/temporal/types';
import type { ScannerInput } from '@repo/contracts';
import { createLogger } from '@repo/logger';
import { getRestateHttpClient, type RestateDiscoveryInput } from '../../utils/restate-http-client';

const logger = createLogger({ name: 'discovery-workflow-orchestrator-restate' });

export class WorkflowOrchestratorRestate {
  private restateUrl?: string;

  constructor(restateUrl?: string) {
    this.restateUrl = restateUrl;
  }

  /**
   * Start discovery workflow
   * Converts Temporal DiscoveryRequest to Restate format
   */
  async startDiscovery(request: DiscoveryRequest) {
    const client = getRestateHttpClient(this.restateUrl);

    // Convert Temporal format to Restate format
    const restateInput: RestateDiscoveryInput = {
      targets: [
        {
          type: 'DOMAIN', // Assuming most discoveries are domains
          value: request.target,
          scope: request.scope || 'EXTERNAL',
        },
      ],
      tools: ['subfinder'], // Only subfinder enabled for now
      scanId: request.workflowId, // Use workflowId as scanId for compatibility
    };

    const result = await client.startDiscovery(restateInput);

    logger.info('Discovery workflow started via Restate', {
      target: request.target,
      scanId: result.scanId,
    });

    // Return compatible handle format
    return {
      workflowId: result.scanId,
      runId: result.scanId, // Restate uses single scanId
      result, // Include full result for immediate use
    };
  }

  /**
   * Start port scan workflow
   */
  async startPortScan(input: ScannerInput, workflowId: string) {
    const client = getRestateHttpClient(this.restateUrl);

    const result = await client.startPortScan({
      target: input.target,
      ports: input.ports?.join(','),
      protocol: input.protocol as 'tcp' | 'udp',
      aggressive: input.serviceDetection,
      timeout: input.timeout,
    });

    logger.info('Port scan workflow started via Restate', {
      workflowId: result.scanId,
      target: input.target,
    });

    return {
      workflowId: result.scanId,
      runId: result.scanId,
      result,
    };
  }

  /**
   * Describe workflow (get status)
   * Restate doesn't have separate workflow status - discovery completes immediately
   * or returns errors in the response
   */
  async describeWorkflow(workflowId: string, runId?: string) {
    const client = getRestateHttpClient(this.restateUrl);

    try {
      const state = await client.getDiscoveryState(workflowId);

      // Check if it's an error response
      if ('error' in state) {
        return {
          workflowId,
          status: {
            name: 'FAILED',
            code: 'FAILED',
          },
          error: state.error,
        };
      }

      // Map Restate phases to Temporal status
      const statusMap: Record<string, string> = {
        VALIDATING: 'RUNNING',
        DISCOVERING: 'RUNNING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
      };

      return {
        workflowId,
        runId,
        status: {
          name: statusMap[state.phase] || 'RUNNING',
          code: statusMap[state.phase] || 'RUNNING',
        },
        startTime: state.startedAt,
        closeTime: state.completedAt,
      };
    } catch (error) {
      logger.error('Failed to describe workflow', { workflowId, error });

      return {
        workflowId,
        status: {
          name: 'FAILED',
          code: 'FAILED',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Fetch discovery result
   * For Restate, the result is available immediately after discovery completes
   */
  async fetchDiscoveryResult(workflowId: string, runId?: string) {
    const client = getRestateHttpClient(this.restateUrl);

    try {
      const state = await client.getDiscoveryState(workflowId);

      // Check if it's an error response
      if ('error' in state) {
        throw new Error(state.error);
      }

      // Convert Restate output to Temporal DiscoveryOutput format
      // Extract subdomains (hostnames) from devices for backward compatibility
      const devices = state.devices || [];
      const subdomains = devices
        .filter((d: any) => d.hostname && d.hostname.length > 0)
        .map((d: any) => d.hostname);

      return {
        scanId: workflowId,
        startedAt: new Date(state.startedAt),
        completedAt: state.completedAt ? new Date(state.completedAt) : new Date(),
        subdomains,
        devices,
        totalTargetsProcessed: state.processedTargets,
        errors: state.errors,
        performance: {
          executionTimeMs: state.completedAt
            ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
            : 0,
          devicesPerSecond: 0,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch discovery result', { workflowId, error });
      throw error;
    }
  }
}

/**
 * Helper function to create orchestrator with Restate URL
 */
export function getWorkflowOrchestratorRestate(restateUrl?: string): WorkflowOrchestratorRestate {
  return new WorkflowOrchestratorRestate(restateUrl);
}

/**
 * Default export for backward compatibility
 */
export const workflowOrchestratorRestate = new WorkflowOrchestratorRestate();
