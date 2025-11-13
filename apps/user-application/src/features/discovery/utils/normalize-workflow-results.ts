/**
 * Discovery Workflow Result Normalization
 *
 * Centralizes the transformation of database resultSummary → UI discovery result format.
 * Eliminates inline payload rebuilding in server handlers.
 *
 * Benefits:
 * - Single source of truth for result shape
 * - Future shape changes happen in ONE place
 * - Consistent field defaults and guards
 * - Type-safe transformations
 *
 * Pattern from OpenPanel:
 * https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
 */

/**
 * Discovery workflow result format (matches UI expectations)
 */
export interface NormalizedDiscoveryResult {
  request: {
    target: string;
    scanType: 'basic' | 'advanced';
    tools: string[];
  };
  results: Array<{
    target: string;
    subdomains: string[];
    results: Array<{
      host: string;
      ip: string;
    }>;
    tool: string;
    timestamp: string;
    success: boolean;
    errors?: string[];
  }>;
  totalSubdomains: number;
  uniqueSubdomains: Array<{
    subdomain: string;
    ip: string;
  }>;
  executionTime: number;
  errors?: string[];
}

/**
 * Normalize discovery workflow result from database resultSummary
 *
 * Takes raw scanRun.resultSummary + fallback target and emits full UI contract.
 *
 * Guards:
 * - Ensures arrays are valid (fallback to empty)
 * - Filters out invalid hostnames (empty strings)
 * - Provides default values for missing fields
 * - Determines success based on errors array
 *
 * Usage in server:
 * ```typescript
 * const scanRun = await getScanRunByRestateWorkflowId(orgId, scanId);
 * const result = normalizeDiscoveryResult(scanRun.resultSummary, scanRun.target);
 * return {
 *   success: true,
 *   result,
 * };
 * ```
 *
 * @param summary - Raw resultSummary from database (any type from JSONB)
 * @param fallbackTarget - Target from scanRun.target if summary doesn't have it
 * @returns Normalized discovery result with all required fields
 */
export function normalizeDiscoveryResult(
  summary: any,
  fallbackTarget: string = 'unknown'
): NormalizedDiscoveryResult {
  const target = summary?.target ?? fallbackTarget;

  // Extract and normalize devices array
  const devices = Array.isArray(summary?.devices) ? summary.devices : [];

  const normalizedDevices = devices.map((device: any) => ({
    host: device.hostname ?? device.host ?? '',
    ip: device.ipAddress ?? device.ip ?? '',
  }));

  // Extract subdomains (filter out empty hostnames)
  const subdomains = devices
    .map((d: any) => d.hostname ?? d.host)
    .filter((host: unknown): host is string => typeof host === 'string' && host.length > 0);

  // Determine success (no errors or empty errors array)
  const errors = Array.isArray(summary?.errors) ? summary.errors : undefined;
  const success = !errors || errors.length === 0;

  return {
    request: {
      target,
      scanType: summary?.scanType ?? 'basic',
      tools: Array.isArray(summary?.tools) ? summary.tools : ['subfinder'],
    },
    results: [
      {
        target,
        subdomains,
        results: normalizedDevices,
        tool: summary?.tool ?? 'restate-scanner',
        timestamp: summary?.completedAt ?? new Date().toISOString(),
        success,
        errors,
      },
    ],
    totalSubdomains: normalizedDevices.length,
    uniqueSubdomains: normalizedDevices.map((device: { host: string; ip: string }) => ({
      subdomain: device.host,
      ip: device.ip,
    })),
    executionTime: summary?.executionTime ?? 0,
    errors,
  };
}
