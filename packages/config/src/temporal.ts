/**
 * Shared Temporal configuration for worker and web server
 *
 * IMPORTANT: This module uses memoization to cache parsed configuration.
 * The config is loaded once on first access and reused for all subsequent calls.
 *
 * For tests that mutate process.env, call resetTemporalConfig() before each test
 * to ensure fresh configuration is loaded.
 *
 * Single source of truth for all Temporal-related defaults.
 */

/**
 * Temporal connection and client configuration
 */
export interface TemporalConnectionConfig {
  serverAddress: string;
  namespace: string;
  taskQueue: string;
  httpApiUrl?: string; // Optional HTTP API URL for Cloudflare Workers
}

/**
 * Worker-specific performance configuration
 */
export interface WorkerPerformanceConfig {
  maxConcurrentActivityTaskExecutions: number;
  maxConcurrentWorkflowTaskExecutions: number;
  maxCachedWorkflows: number;
  debugMode: boolean;
}

/**
 * Workflow execution timeout configuration
 */
export interface WorkflowTimeoutConfig {
  workflowRunTimeout: string;
  workflowExecutionTimeout: string;
  workflowTaskTimeout: string;
}

/**
 * Complete Temporal configuration
 */
export interface TemporalConfig {
  connection: TemporalConnectionConfig;
  worker: WorkerPerformanceConfig;
  workflowTimeouts: WorkflowTimeoutConfig;
  completedScansLimit: number;
  environment: string;
}

/**
 * Parse integer with fallback (no logging, just safe parsing)
 */
function parseIntOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Cached configuration - loaded once on first access
 */
let cachedConfig: TemporalConfig | null = null;

/**
 * Load Temporal configuration from environment variables
 * Memoized - only parses once, subsequent calls return cached value
 */
function loadTemporalConfig(): TemporalConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Connection defaults
  const serverAddress = process.env.TEMPORAL_SERVER_ADDRESS || '127.0.0.1:7233';
  const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || 'scanner-tasks';
  const httpApiUrl = process.env.TEMPORAL_HTTP_API_URL; // Optional, for Cloudflare Workers

  // Worker performance defaults
  const maxConcurrentActivityTaskExecutions = parseIntOr(
    process.env.MAX_CONCURRENT_ACTIVITIES,
    20
  );
  const maxConcurrentWorkflowTaskExecutions = parseIntOr(
    process.env.MAX_CONCURRENT_WORKFLOWS,
    100
  );
  const maxCachedWorkflows = parseIntOr(
    process.env.MAX_CACHED_WORKFLOWS,
    100
  );

  // Workflow timeout defaults (pass through as-is, no strict validation)
  const workflowRunTimeout = process.env.WORKFLOW_RUN_TIMEOUT || '1 hour';
  const workflowExecutionTimeout = process.env.WORKFLOW_EXECUTION_TIMEOUT || '1 hour';
  const workflowTaskTimeout = process.env.WORKFLOW_TASK_TIMEOUT || '2 minutes';

  // Orchestrator defaults
  const completedScansLimit = parseIntOr(
    process.env.TEMPORAL_COMPLETED_SCANS_LIMIT,
    100
  );

  // Environment (accept any string, don't force enum)
  const environment = process.env.NODE_ENV || 'development';

  // Debug mode: explicit true or development mode
  const debugMode = process.env.DEBUG_MODE === 'true' || environment === 'development';

  cachedConfig = {
    connection: {
      serverAddress,
      namespace,
      taskQueue,
      httpApiUrl,
    },
    worker: {
      maxConcurrentActivityTaskExecutions,
      maxConcurrentWorkflowTaskExecutions,
      maxCachedWorkflows,
      debugMode,
    },
    workflowTimeouts: {
      workflowRunTimeout,
      workflowExecutionTimeout,
      workflowTaskTimeout,
    },
    completedScansLimit,
    environment,
  };

  return cachedConfig;
}

/**
 * Get complete Temporal configuration
 * Memoized - safe to call multiple times
 *
 * NOTE: For tests that mutate process.env, call resetTemporalConfig() first
 */
export function getTemporalConfig(): TemporalConfig {
  return loadTemporalConfig();
}

/**
 * Get connection configuration (server address, namespace, task queue)
 */
export function getTemporalConnectionConfig(): TemporalConnectionConfig {
  return loadTemporalConfig().connection;
}

/**
 * Get worker performance configuration
 */
export function getWorkerConfig(): WorkerPerformanceConfig {
  return loadTemporalConfig().worker;
}

/**
 * Get workflow timeout configuration
 */
export function getWorkflowTimeoutConfig(): WorkflowTimeoutConfig {
  return loadTemporalConfig().workflowTimeouts;
}

/**
 * Reset cached configuration
 * Useful for testing when environment variables are modified
 */
export function resetTemporalConfig(): void {
  cachedConfig = null;
}
