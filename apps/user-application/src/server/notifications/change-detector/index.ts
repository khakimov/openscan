/**
 * Change Detection System
 *
 * Detects changes between scan results and generates notifications.
 *
 * Modular structure:
 * - baseline.ts: Scan history fetching
 * - diff-ports.ts: New/closed port detection
 * - diff-service-drift.ts: Service configuration changes
 * - diff-cves.ts: CVE lifecycle (new, severity increase, fixed, regressed)
 * - types.ts: Shared type definitions
 * - utils.ts: Common helper functions
 *
 * See: docs/NOTIFICATIONS.md for complete algorithm documentation
 */

import type { EnrichedScanResultSummary } from '@repo/data-ops';
import { scanRuns } from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import { getRecentScans } from './baseline';
import { diffPorts } from './diff-ports';
import { diffServiceDrift } from './diff-service-drift';
import { diffCVEs } from './diff-cves';
import type { ScanChange } from './types';

const logger = createLogger({ name: 'change-detector' });

// Re-export types and utilities for external use
export type { ScanChange, CVEInfo } from './types';
export type { ScanHistoryOptions } from './baseline';
export { getScanHistory, getBaselineScan, getRecentScans } from './baseline';
export { diffPorts } from './diff-ports';
export { diffServiceDrift } from './diff-service-drift';
export { diffCVEs } from './diff-cves';

/**
 * Detect all changes between current scan and baseline
 *
 * Usage:
 * ```typescript
 * const changes = await detectScanChanges({
 *   deviceId: 'dev_123',
 *   currentScan: scanRun,
 *   organizationId: 'org_123',
 * });
 *
 * // changes = [
 * //   { type: 'NEW_PORT', severity: 'HIGH', title: '...', ... },
 * //   { type: 'NEW_CVE', severity: 'CRITICAL', title: '...', ... },
 * // ]
 * ```
 */
export async function detectScanChanges(params: {
  deviceId: string;
  currentScan: typeof scanRuns.$inferSelect;
  organizationId: string;
}): Promise<ScanChange[]> {
  const { deviceId, currentScan, organizationId } = params;

  // Step 1: Get recent scan history for comparison
  // We need up to 2 previous scans for regression detection:
  // - Scan N-1 (previous): baseline for port/CVE diffing
  // - Scan N-2 (previousPrevious): for CVE regression detection
  const recentScans = await getRecentScans(
    deviceId,
    currentScan.id,
    organizationId,
    2 // Fetch 2 scans: N-1 and N-2
  );

  // Edge Case: First successful scan - no baseline to compare against
  if (recentScans.length === 0) {
    logger.info('[Change Detection] No baseline scan found - first successful scan', {
      deviceId,
      scanRunId: currentScan.id,
    });
    return [];
  }

  const baseline = recentScans[0]; // Most recent (scan N-1)
  const previousPrevious = recentScans.length > 1 ? recentScans[1] : null; // Second most recent (scan N-2)

  // Step 2: Extract result summaries
  const currentSummary = currentScan.resultSummary as EnrichedScanResultSummary | null;
  const baselineSummary = baseline.resultSummary as EnrichedScanResultSummary | null;
  const prevPrevSummary = previousPrevious?.resultSummary as EnrichedScanResultSummary | null;

  if (!currentSummary) {
    logger.warn('[Change Detection] Current scan has no result summary', {
      scanRunId: currentScan.id,
    });
    return [];
  }

  // Step 3: Run port, CVE (with regression detection), and service drift diffs
  const portChanges = diffPorts(currentSummary, baselineSummary, deviceId);
  const cveChanges = diffCVEs(currentSummary, baselineSummary, deviceId, prevPrevSummary);
  const serviceDriftChanges = diffServiceDrift(currentSummary, baselineSummary, deviceId);

  const allChanges = [...portChanges, ...cveChanges, ...serviceDriftChanges];

  logger.info('[Change Detection] Changes detected', {
    deviceId,
    currentScanId: currentScan.id,
    baselineScanId: baseline.id,
    previousPreviousScanId: previousPrevious?.id,
    portChanges: portChanges.length,
    cveChanges: cveChanges.length,
    serviceDriftChanges: serviceDriftChanges.length,
    total: allChanges.length,
  });

  return allChanges;
}
