/**
 * Worker activity policy configuration
 *
 * Defines timeout and retry policies for activities.
 * Database-agnostic: No persistence policies needed.
 */

import type { ActivityOptions } from '@temporalio/workflow';

/**
 * Default retry policy used as base for all activities
 */
const DEFAULT_RETRY_POLICY: NonNullable<ActivityOptions['retry']> = {
  initialInterval: '1 second',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 3,
};

/**
 * Base discovery tool policies (before multiplier)
 */
const BASE_DISCOVERY_TOOL_POLICIES = {
  subfinder: {
    startToCloseTimeout: '2 minutes',
    retry: DEFAULT_RETRY_POLICY,
  },
  amass: {
    startToCloseTimeout: '10 minutes',
    retry: {
      ...DEFAULT_RETRY_POLICY,
      maximumAttempts: 2,
    },
  },
  assetfinder: {
    startToCloseTimeout: '2 minutes',
    retry: DEFAULT_RETRY_POLICY,
  },
} as const;

/**
 * Apply timeout multiplier to activity policy
 */
function applyTimeoutMultiplier(
  policy: ActivityOptions,
  multiplier: number
): ActivityOptions {
  if (multiplier === 1) {
    return policy;
  }

  const timeout = policy.startToCloseTimeout;
  if (!timeout) {
    return policy;
  }

  // Parse timeout string (e.g., "10 minutes" -> 10)
  const match = String(timeout).match(/^(\d+)\s*(\w+)$/);
  if (!match) {
    return policy;
  }

  const [, value, unit] = match;
  const newValue = Math.ceil(parseFloat(value) * multiplier);

  return {
    ...policy,
    startToCloseTimeout: `${newValue} ${unit}` as ActivityOptions['startToCloseTimeout'],
  };
}

/**
 * Get timeout multiplier from environment
 *
 * NOTE: This file is bundled into Temporal workflows, which run in a sandboxed
 * environment without access to process.env. Therefore, we use a compile-time
 * constant. To override timeouts in production, rebuild the worker with a
 * different timeout multiplier, or modify this constant directly.
 */
const TIMEOUT_MULTIPLIER = 1.0;

// If you need to scale timeouts for your environment, change the value above.
// For example:
// const TIMEOUT_MULTIPLIER = 2.0;  // Doubles all timeouts

/**
 * Runtime discovery tool policies (with multiplier applied)
 */
export const discoveryToolPolicies = {
  subfinder: applyTimeoutMultiplier(
    BASE_DISCOVERY_TOOL_POLICIES.subfinder,
    TIMEOUT_MULTIPLIER
  ),
  amass: applyTimeoutMultiplier(
    BASE_DISCOVERY_TOOL_POLICIES.amass,
    TIMEOUT_MULTIPLIER
  ),
  assetfinder: applyTimeoutMultiplier(
    BASE_DISCOVERY_TOOL_POLICIES.assetfinder,
    TIMEOUT_MULTIPLIER
  ),
} as const;
