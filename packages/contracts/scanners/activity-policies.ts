/**
 * Centralized Temporal activity policies for scanner workflows
 *
 * This module provides consistent retry/timeout configurations across all
 * scanning activities. Centralizing these policies ensures:
 * - Consistent SLOs across workflows
 * - Easy tuning without code duplication
 * - Clear documentation of timeout rationale
 *
 * @module activity-policies
 */

import type { ActivityOptions } from '@temporalio/workflow';

/**
 * Default retry policy used as base for all activities
 */
export const DEFAULT_RETRY_POLICY: NonNullable<ActivityOptions['retry']> = {
  initialInterval: '1 second',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 3,
};

/**
 * Scanner tool activity policies
 *
 * Timeouts are based on typical execution times:
 * - Masscan: Fast TCP SYN scanner, 2-5min for /16 networks
 * - Rustscan: Ultra-fast port scanner, 10-30sec for single hosts
 * - Nmap: Comprehensive scanner with service detection, 15-30min for 1000 ports
 */
export const SCANNER_TOOL_POLICIES = {
  /**
   * Masscan: Fast TCP SYN scanner
   * - Typical: 2-5 minutes for /16 network
   * - Timeout: 10 minutes (allows for larger scans + network delays)
   * - Retries: 3 attempts (matches original inline config)
   */
  masscan: {
    startToCloseTimeout: '10 minutes',
    retry: DEFAULT_RETRY_POLICY, // 3 attempts
  },

  /**
   * Rustscan: Ultra-fast port scanner
   * - Typical: 10-30 seconds for single host
   * - Timeout: 3 minutes (generous for slow targets)
   * - Retries: 3 attempts (very fast, can afford retries)
   */
  rustscan: {
    startToCloseTimeout: '3 minutes',
    retry: DEFAULT_RETRY_POLICY,
  },

  /**
   * Nmap: Comprehensive network scanner with service detection
   * - Typical: 5-15 minutes for moderate scans
   * - Timeout: 20 minutes (allows service detection + OS fingerprinting)
   * - Retries: 3 attempts (matches original inline config)
   *
   * Note: Actual timeout varies by scan profile:
   * - PS_L1 (uptime): ~1-2 minutes
   * - PS_L2 (service detect): ~10-15 minutes
   * - PS_L3 (aggressive): ~15-25 minutes
   */
  nmap: {
    startToCloseTimeout: '20 minutes',
    retry: DEFAULT_RETRY_POLICY, // 3 attempts
  },
} as const satisfies Record<'masscan' | 'rustscan' | 'nmap', ActivityOptions>;

/**
 * Persistence activity policies
 *
 * Database operations with higher retry tolerance since they're
 * idempotent and critical for data integrity.
 */
export const PERSISTENCE_POLICY: ActivityOptions = {
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 5, // Database writes should be more resilient
  },
};

/**
 * Orchestration activity policies
 *
 * Fast operations for workflow state management.
 * Higher retry count for reliability.
 */
export const ORCHESTRATION_POLICY: ActivityOptions = {
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '500ms',
    maximumInterval: '5 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 5, // State updates should be reliable
  },
};

/**
 * Discovery tool activity policies
 *
 * Subdomain enumeration tools with varying execution times:
 * - Subfinder: ~30-60 seconds
 * - Amass: ~2-5 minutes
 * - Assetfinder: ~10-30 seconds
 */
export const DISCOVERY_TOOL_POLICIES = {
  /**
   * Subfinder: Fast passive subdomain enumeration
   */
  subfinder: {
    startToCloseTimeout: '2 minutes',
    retry: DEFAULT_RETRY_POLICY,
  },

  /**
   * Amass: Comprehensive OSINT-based subdomain discovery
   * - Slowest discovery tool due to extensive data sources
   */
  amass: {
    startToCloseTimeout: '10 minutes',
    retry: {
      ...DEFAULT_RETRY_POLICY,
      maximumAttempts: 2, // Expensive, limit retries
    },
  },

  /**
   * Assetfinder: Fast passive subdomain finder
   */
  assetfinder: {
    startToCloseTimeout: '2 minutes',
    retry: DEFAULT_RETRY_POLICY,
  },
} as const satisfies Record<'subfinder' | 'amass' | 'assetfinder', ActivityOptions>;

/**
 * Web scanning activity policies
 *
 * HTTP/HTTPS service fingerprinting and analysis
 */
export const WEBSCAN_POLICY: ActivityOptions = {
  startToCloseTimeout: '5 minutes',
  retry: DEFAULT_RETRY_POLICY,
};

/**
 * Helper function to create custom activity policy
 * by overriding defaults
 */
export function createCustomPolicy(
  basePolicy: ActivityOptions,
  overrides: Partial<ActivityOptions>
): ActivityOptions {
  return {
    ...basePolicy,
    ...overrides,
    retry: overrides.retry
      ? { ...basePolicy.retry, ...overrides.retry }
      : basePolicy.retry,
  };
}

/**
 * Apply timeout multiplier to activity policy
 *
 * Pure helper for scaling timeouts. Environment reads should happen
 * in the worker layer, not in shared contracts package.
 *
 * @example
 * ```typescript
 * // In worker code:
 * const multiplier = parseFloat(process.env.SCANNER_TIMEOUT_MULTIPLIER || '1');
 * const nmapPolicy = applyTimeoutMultiplier(SCANNER_TOOL_POLICIES.nmap, multiplier);
 * const { runNmapScan } = proxyActivities<typeof activities>(nmapPolicy);
 * ```
 */
export function applyTimeoutMultiplier(
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
    startToCloseTimeout: `${newValue} ${unit}`,
  };
}