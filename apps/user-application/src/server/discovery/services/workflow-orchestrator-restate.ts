/**
 * Workflow Orchestrator - Restate Implementation
 *
 * Replaces Temporal with Restate for discovery workflows.
 * Provides a compatible interface for easy migration.
 */

import type { DiscoveryRequest } from '../utils/workflow-helpers';
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
          scope: 'EXTERNAL', // DiscoveryRequest doesn't include scope, defaulting to EXTERNAL
        },
      ],
      tools: request.tools || ['subfinder'], // Use requested tools or default to subfinder
    };

    const result = await client.startDiscovery(restateInput);

    logger.info('Discovery workflow started via Restate', {
      target: request.target,
      scanId: result.scanId,
    });

    return {
      scanId: result.scanId, // Restate workflow key
      runId: result.scanId, // Restate uses single scanId
      result, // Include full result for immediate use
    };
  }

  /**
   * Start port scan workflow
   */
  async startPortScan(input: ScannerInput) {
    const client = getRestateHttpClient(this.restateUrl);

    // Get first target from targets array
    const target = input.targets[0];
    if (!target) {
      throw new Error('No targets provided for port scan');
    }
    const targetValue = (target as any).value as string;

    const result = await client.startPortScan({
      target: targetValue,
      ports: input.scanOptions?.requestedPorts?.join(','),
      protocol: 'tcp', // Default to tcp, can be made configurable
      aggressive: input.scanOptions?.aggressive,
      timeout: 120, // Default timeout, can be made configurable
    });

    logger.info('Port scan workflow started via Restate', {
      scanId: result.scanId,
      target: targetValue,
    });

    return {
      scanId: result.scanId, // Restate workflow key
      runId: result.scanId,
      result,
    };
  }

  /**
   * Describe workflow (get status)
   * Restate doesn't have separate workflow status - discovery completes immediately
   * or returns errors in the response
   */
  async describeWorkflow(scanId: string, runId?: string) {
    const client = getRestateHttpClient(this.restateUrl);

    try {
      const state = await client.getDiscoveryState(scanId);

      // Check if it's an error response
      if ('error' in state) {
        return {
          scanId, // Restate workflow key
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
        scanId, // Restate workflow key
        runId,
        status: {
          name: statusMap[state.phase] || 'RUNNING',
          code: statusMap[state.phase] || 'RUNNING',
        },
        startTime: state.startedAt,
        closeTime: state.completedAt,
      };
    } catch (error) {
      logger.error('Failed to describe workflow', { scanId, error });

      return {
        scanId, // Restate workflow key
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
  async fetchDiscoveryResult(scanId: string, _runId?: string) {
    const client = getRestateHttpClient(this.restateUrl);

    try {
      const state = await client.getDiscoveryState(scanId);

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
        scanId, // Restate workflow key
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
      logger.error('Failed to fetch discovery result', { scanId, error });
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
