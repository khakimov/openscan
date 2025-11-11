import { eq, and, desc, ne, getDb, scanRuns, scanRunDevices, type SQL } from '@repo/data-ops';

/**
 * Baseline Selection
 *
 * Utilities for fetching previous scan history used in change detection.
 * Consolidated query builder ensures filters and joins stay in sync.
 */

export interface ScanHistoryOptions {
  /** Number of scans to fetch (default: 1) */
  limit?: number;
  /** Scan IDs to exclude from results */
  excludeIds?: string[];
  /** Only fetch scans with specific status (default: 'SUCCEEDED') */
  status?: 'SUCCEEDED' | 'FAILED' | 'PENDING';
}

/**
 * Get scan history for a device
 *
 * Consolidated query builder that handles both baseline selection and multi-scan history.
 * Returns successful scans ordered by completion time (most recent first).
 *
 * @param deviceId Device identifier
 * @param organizationId Organization scope
 * @param options Query options (limit, excludeIds, status)
 * @returns Array of scan runs (empty if no history, [0] = most recent, [1] = second most recent, etc.)
 *
 * @example
 * ```typescript
 * // Get baseline (most recent scan)
 * const [baseline] = await getScanHistory(deviceId, orgId, { limit: 1, excludeIds: [currentScanId] });
 *
 * // Get last 2 scans for regression detection
 * const [baseline, previousPrevious] = await getScanHistory(deviceId, orgId, { limit: 2, excludeIds: [currentScanId] });
 * ```
 */
export async function getScanHistory(
  deviceId: string,
  organizationId: string,
  options: ScanHistoryOptions = {}
): Promise<Array<typeof scanRuns.$inferSelect>> {
  const { limit = 1, excludeIds = [], status = 'SUCCEEDED' } = options;

  const db = getDb();

  // Build conditions array
  const conditions: SQL[] = [
    eq(scanRunDevices.deviceId, deviceId),
    eq(scanRuns.organizationId, organizationId),
    eq(scanRuns.status, status),
  ];

  // Add exclusions if provided
  if (excludeIds.length > 0) {
    conditions.push(...excludeIds.map((id) => ne(scanRuns.id, id)));
  }

  const results = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(...conditions))
    .orderBy(desc(scanRuns.completedAt))
    .limit(limit);

  return results.map((r) => r.scan_runs);
}

/**
 * Get the previous successful scan for this device (baseline for comparison)
 *
 * Convenience wrapper around getScanHistory for the common case of fetching
 * the single most recent scan (N-1).
 *
 * @param deviceId Device identifier
 * @param currentScanRunId Current scan to exclude
 * @param organizationId Organization scope
 * @returns Most recent successful scan or null
 */
export async function getBaselineScan(
  deviceId: string,
  currentScanRunId: string,
  organizationId: string
): Promise<typeof scanRuns.$inferSelect | null> {
  const [baseline] = await getScanHistory(deviceId, organizationId, {
    limit: 1,
    excludeIds: currentScanRunId ? [currentScanRunId] : [],
  });

  return baseline || null;
}

/**
 * Get recent scan history for regression detection
 *
 * Convenience wrapper around getScanHistory for fetching multiple previous scans.
 * Used for CVE regression detection (3-scan comparison).
 *
 * @param deviceId Device identifier
 * @param currentScanRunId Current scan to exclude
 * @param organizationId Organization scope
 * @param limit Number of scans to fetch (default 2 for 3-scan regression detection)
 * @returns Array of scan runs, most recent first ([0] = N-1, [1] = N-2, etc.)
 */
export async function getRecentScans(
  deviceId: string,
  currentScanRunId: string,
  organizationId: string,
  limit: number = 2
): Promise<Array<typeof scanRuns.$inferSelect>> {
  return getScanHistory(deviceId, organizationId, {
    limit,
    excludeIds: currentScanRunId ? [currentScanRunId] : [],
  });
}
