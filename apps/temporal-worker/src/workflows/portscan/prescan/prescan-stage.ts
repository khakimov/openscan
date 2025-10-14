/**
 * Prescan Stage - Pure Execution Wrapper
 *
 * CONTRACT:
 * - No Temporal runtime APIs (Context, log, setHandler, proxyActivities)
 * - No state mutations (caller manages workflow state)
 * - No logging (caller logs before/after execution)
 * - No cancellation checks (caller handles via maybeAbortForCancellation)
 * - Returns structured data with typed errors
 *
 * The workflow is responsible for:
 * - Cancellation checks before calling this function
 * - Logging/metrics before/after execution
 * - State updates based on returned data
 * - Error handling strategy
 */

import type { DiscoveredPort } from '@repo/temporal/contracts';
import type { MasscanConfig } from '../activities/masscan';
import type { RustscanConfig } from '../activities/rustscan';

/**
 * Typed error codes for deterministic branching
 */
export type PrescanErrorCode =
  | 'MASSCAN_TIMEOUT'
  | 'MASSCAN_EXECUTION_FAILED'
  | 'RUSTSCAN_TIMEOUT'
  | 'RUSTSCAN_EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Structured error object (not raw strings)
 */
export interface PrescanError {
  code: PrescanErrorCode;
  message: string;
  tool: 'masscan' | 'rustscan';
}

/**
 * Configuration for prescan stage
 */
export interface PrescanStageInput {
  target: string;
  masscanConfig: MasscanConfig;
  rustscanConfigBuilder: (masscanPorts: DiscoveredPort[]) => RustscanConfig;
  shouldRunMasscan: boolean;
  shouldRunRustscan: boolean;
}

/**
 * Activity proxies (built by workflow, passed to stage)
 */
export interface PrescanStageActivities {
  runMasscanScan: (
    target: string,
    config: MasscanConfig
  ) => Promise<DiscoveredPort[]>;
  runRustscan: (
    target: string,
    config: RustscanConfig
  ) => Promise<DiscoveredPort[]>;
}

/**
 * Structured result with typed errors
 */
export interface PrescanStageResult {
  masscanPorts: DiscoveredPort[];
  rustscanPorts: DiscoveredPort[];
  masscanError?: PrescanError;
  rustscanError?: PrescanError;
}

/**
 * Classify error into typed error code
 */
function classifyError(
  error: unknown,
  tool: 'masscan' | 'rustscan'
): PrescanError {
  // CRITICAL: Rethrow cancellation errors so workflow can handle them
  // Walk the cause chain to catch wrapped cancellations (e.g., ActivityFailure wrapping CancelledFailure)
  let current = error;
  while (current instanceof Error) {
    const errorName = current.constructor.name;
    if (
      errorName === 'CancelledFailure' ||
      errorName === 'ActivityCancelledError'
    ) {
      throw current;
    }
    // Walk down the cause chain
    current = (current as any).cause;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Determine error code based on message content
  let code: PrescanErrorCode;
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    code = tool === 'masscan' ? 'MASSCAN_TIMEOUT' : 'RUSTSCAN_TIMEOUT';
  } else {
    code =
      tool === 'masscan'
        ? 'MASSCAN_EXECUTION_FAILED'
        : 'RUSTSCAN_EXECUTION_FAILED';
  }

  return { code, message, tool };
}

/**
 * Execute prescan stage activities (masscan + rustscan).
 *
 * This is a pure orchestration helper - the workflow is responsible for:
 * - Cancellation checks before/after calling this function
 * - Logging/metrics before/after execution
 * - State updates based on returned data
 * - Error handling strategy
 *
 * @param activities - Pre-built activity proxies from workflow
 * @param config - Prescan configuration
 * @returns Structured result with ports and typed errors
 */
export async function executePrescanStage(
  activities: PrescanStageActivities,
  config: PrescanStageInput
): Promise<PrescanStageResult> {
  const result: PrescanStageResult = {
    masscanPorts: [],
    rustscanPorts: [],
  };

  // Masscan execution (no logging, no progress updates)
  if (config.shouldRunMasscan) {
    try {
      result.masscanPorts = await activities.runMasscanScan(
        config.target,
        config.masscanConfig
      );
    } catch (error) {
      result.masscanError = classifyError(error, 'masscan');
    }
  }

  // Rustscan execution (no logging, no progress updates)
  // CRITICAL: Build rustscan config AFTER masscan completes to include masscan hints
  if (config.shouldRunRustscan) {
    try {
      const rustscanConfig = config.rustscanConfigBuilder(result.masscanPorts);
      result.rustscanPorts = await activities.runRustscan(
        config.target,
        rustscanConfig
      );
    } catch (error) {
      result.rustscanError = classifyError(error, 'rustscan');
    }
  }

  return result;
}
