import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'temporal-client-factory' });

/**
 * Detect if we're running in a Node.js or Cloudflare Workers environment
 */
export function isNodeJsRuntime(): boolean {
  try {
    // Check for Node.js-specific globals
    return typeof process !== 'undefined' &&
           typeof process.versions !== 'undefined' &&
           typeof process.versions.node !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Get the appropriate Temporal client based on the runtime environment
 */
export async function getTemporalClient() {
  if (isNodeJsRuntime()) {
    logger.info('Using gRPC Temporal client (Node.js runtime)');
    const { getTemporalClient: getGrpcClient } = await import('./temporal-client');
    return getGrpcClient();
  } else {
    logger.info('Using HTTP Temporal client (Workers runtime)');
    const { getTemporalHttpClient } = await import('./temporal-http-client');
    return getTemporalHttpClient();
  }
}

/**
 * Get the appropriate workflow orchestrator based on the runtime environment
 */
export async function getWorkflowOrchestrator() {
  if (isNodeJsRuntime()) {
    logger.info('Using gRPC workflow orchestrator (Node.js runtime)');
    const { workflowOrchestrator } = await import('../discovery/services/workflow-orchestrator');
    return workflowOrchestrator;
  } else {
    logger.info('Using HTTP workflow orchestrator (Workers runtime)');
    const { workflowOrchestratorHttp } = await import('../discovery/services/workflow-orchestrator-http');
    return workflowOrchestratorHttp;
  }
}
