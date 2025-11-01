/**
 * Postback Analytics Tracking
 *
 * Unified analytics helper for tracking postback events in Workers Analytics Engine.
 * Provides consistent schema across all postback types.
 */

/**
 * Track postback event in Analytics Engine
 *
 * Writes a data point with consistent schema:
 * - indexes[0]: Event type (e.g., 'postback_portscan_success')
 * - blobs[0-3]: String metadata (scanId, entityId, organizationId, etc.)
 * - doubles[0-1]: Numeric metadata (latency, counts, etc.)
 *
 * @param env - Environment bindings with ANALYTICS
 * @param eventType - Event type string (e.g., 'postback_portscan_success')
 * @param startTime - Timestamp when postback processing started
 * @param metadata - Optional metadata object
 *
 * @example
 * trackPostbackAnalytics(env, 'postback_portscan_success', startTime, {
 *   blobs: [scanId, deviceId, organizationId],
 *   doubles: [latency, portCount],
 * });
 *
 * @example
 * trackPostbackAnalytics(env, 'postback_auth_failed', startTime, {
 *   blobs: ['unknown', 'unknown', 'Authentication failed'],
 * });
 */
export function trackPostbackAnalytics(
  env: { ANALYTICS?: AnalyticsEngineDataset } | undefined,
  eventType: string,
  startTime: number,
  metadata?: {
    blobs?: string[];
    doubles?: number[];
  }
): void {
  if (!env?.ANALYTICS) {
    // Analytics Engine not available (local dev or missing binding)
    return;
  }

  // Calculate latency (always included)
  const latency = Date.now() - startTime;

  // Build doubles array with latency first, then any additional metrics
  const doubles = [latency, ...(metadata?.doubles || [])];

  env.ANALYTICS.writeDataPoint({
    indexes: [eventType],
    blobs: metadata?.blobs || [],
    doubles,
  });
}

/**
 * Analytics event type patterns
 *
 * Standard naming convention for postback events:
 * - postback_{type}_{status}
 *
 * Examples:
 * - postback_portscan_success
 * - postback_portscan_failure
 * - postback_discovery_success
 * - postback_discovery_failure
 * - postback_auth_failed
 * - postback_validation_failed
 * - postback_device_not_found
 */
export const AnalyticsEventTypes = {
  // Authentication
  AUTH_FAILED: 'postback_auth_failed',
  VALIDATION_FAILED: 'postback_validation_failed',

  // Port Scan
  PORTSCAN_SUCCESS: 'postback_portscan_success',
  PORTSCAN_FAILURE: 'postback_portscan_failure',
  PORTSCAN_DEVICE_NOT_FOUND: 'postback_portscan_device_not_found',

  // Discovery
  DISCOVERY_SUCCESS: 'postback_discovery_success',
  DISCOVERY_FAILURE: 'postback_discovery_failure',

  // HTTPx
  HTTPX_SUCCESS: 'postback_httpx_success',
  HTTPX_FAILURE: 'postback_httpx_failure',

  // Generic
  GENERIC_FAILURE: 'postback_failure',
} as const;

/**
 * Helper to build analytics metadata for success cases
 *
 * Standard success metadata includes:
 * - blobs: [scanId, entityId, organizationId]
 * - doubles: [latency, resultCount]
 *
 * @example
 * return {
 *   success: true,
 *   analytics: buildSuccessAnalytics(
 *     AnalyticsEventTypes.PORTSCAN_SUCCESS,
 *     { scanId, deviceId, organizationId, resultCount: ports.length }
 *   ),
 * };
 */
export function buildSuccessAnalytics(
  eventType: string,
  params: {
    scanId: string;
    entityId: string; // deviceId for port scans, projectId for discovery
    organizationId: string;
    resultCount?: number;
  }
) {
  return {
    eventType,
    blobs: [params.scanId, params.entityId, params.organizationId],
    doubles: params.resultCount !== undefined ? [params.resultCount] : undefined,
  };
}

/**
 * Helper to build analytics metadata for failure cases
 *
 * Standard failure metadata includes:
 * - blobs: [scanId, entityId, errorMessage]
 * - doubles: [] (only latency from trackPostbackAnalytics)
 *
 * @example
 * return {
 *   success: false,
 *   analytics: buildFailureAnalytics(
 *     AnalyticsEventTypes.PORTSCAN_FAILURE,
 *     { scanId, deviceId, error: 'Device not found' }
 *   ),
 * };
 */
export function buildFailureAnalytics(
  eventType: string,
  params: {
    scanId: string;
    entityId: string;
    error: string;
  }
) {
  return {
    eventType,
    blobs: [params.scanId, params.entityId, params.error],
  };
}
