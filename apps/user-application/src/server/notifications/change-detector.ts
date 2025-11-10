import { eq, and, desc, ne } from '@repo/data-ops';
import { getDb, scanRuns, scanRunDevices } from '@repo/data-ops';
import { safeParseCVEEnrichment } from '@repo/data-ops';
import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import {
  createNewPortNotification,
  createClosedPortNotification,
  createNewCVENotification,
  createCVESeverityIncreaseNotification,
  createServiceDriftNotification,
  getSeverityOrder,
} from '@repo/data-ops';

const logger = createLogger({ name: 'change-detector' });

/**
 * Change Detection Service
 *
 * Compares current scan results with previous baseline to detect:
 * - New ports opened
 * - Ports closed
 * - New CVEs discovered
 * - CVE severity upgrades
 *
 * See: docs/NOTIFICATIONS.md for complete algorithm documentation
 */

// ============================================================================
// Types
// ============================================================================

export interface ScanChange {
  type: 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'SERVICE_DRIFT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  module: 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT' | 'GENERAL';
  title: string;
  message?: string;
  data: Record<string, any>;
  fingerprint: string;
}

interface CVEInfo {
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
}

// ============================================================================
// Baseline Selection
// ============================================================================

/**
 * Get the previous successful scan for this device (baseline for comparison)
 *
 * Pattern: Last completed scan for same device, excluding current run
 */
export async function getBaselineScan(
  deviceId: string,
  currentScanRunId: string,
  organizationId: string
): Promise<typeof scanRuns.$inferSelect | null> {
  const db = getDb();

  const conditions = [
    eq(scanRunDevices.deviceId, deviceId),
    eq(scanRuns.organizationId, organizationId),
    eq(scanRuns.status, 'SUCCEEDED'), // Only compare against successful scans
    // Exclude current scan
    ...(currentScanRunId ? [ne(scanRuns.id, currentScanRunId)] : []),
  ];

  const [baseline] = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId)) // Fixed: runId not scanRunId
    .where(and(...conditions))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1);

  return baseline?.scan_runs || null;
}

// ============================================================================
// Port Diffing
// ============================================================================

/**
 * Compare port scan results to detect new/closed ports
 *
 * Algorithm:
 * 1. Build maps: port+protocol → state
 * 2. Detect NEW: port now "open" but was not open before (or didn't exist)
 * 3. Detect CLOSED: port was "open" before but now closed/filtered/missing
 *
 * Returns: Array of change notifications
 */
export function diffPorts(
  current: EnrichedScanResultSummary,
  previous: EnrichedScanResultSummary | null,
  deviceId: string
): ScanChange[] {
  const changes: ScanChange[] = [];

  const currentPorts = getPortSnapshots(current);
  const previousPorts = previous ? getPortSnapshots(previous) : [];

  // Build maps: "{protocol}/{port}" → port snapshot
  const prevPortMap = new Map(previousPorts.map((p) => [getPortKey(p), p]));
  const currPortMap = new Map(currentPorts.map((p) => [getPortKey(p), p]));

  // Detect NEW PORTS (now open, was not open before)
  for (const port of currentPorts) {
    const key = getPortKey(port);
    const wasOpen = prevPortMap.get(key)?.state === 'open';
    const isNowOpen = port.state === 'open';

    if (isNowOpen && !wasOpen) {
      // Extract service name
      const serviceName = port.service?.name || port.service?.product || 'service';
      const serviceVersion = port.service?.version;

      // Use catalog function for consistent messaging
      const notification = createNewPortNotification({
        port: port.port,
        protocol: port.protocol,
        service: serviceName,
        version: serviceVersion || undefined,
      });

      changes.push({
        ...notification,
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          state: port.state,
          version: serviceVersion,
        },
        fingerprint: `new_port:${deviceId}:${port.port}:${port.protocol}`,
      });
    }
  }

  // Detect CLOSED PORTS (was open, now closed/filtered/missing)
  for (const port of previousPorts) {
    const key = getPortKey(port);
    const wasOpen = port.state === 'open';
    const currentPort = currPortMap.get(key);
    const isNowOpen = currentPort?.state === 'open';

    if (wasOpen && !isNowOpen) {
      // Extract service name
      const serviceName = port.service?.name || port.service?.product || 'service';

      // Use catalog function for consistent messaging
      const notification = createClosedPortNotification({
        port: port.port,
        protocol: port.protocol,
        service: serviceName,
      });

      changes.push({
        ...notification,
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          previousState: port.state,
          currentState: currentPort?.state || 'closed',
        },
        fingerprint: `closed_port:${deviceId}:${port.port}:${port.protocol}`,
      });
    }
  }

  return changes;
}

function getPortSnapshots(summary: EnrichedScanResultSummary | null): PortSnapshot[] {
  if (!summary?.portSnapshots) return [];
  return summary.portSnapshots;
}

function getPortKey(port: Pick<PortSnapshot, 'protocol' | 'port'>): string {
  return `${port.protocol}/${port.port}`;
}

// ============================================================================
// Service Drift Detection (sec-8sh)
// ============================================================================

/**
 * Compare port service metadata to detect configuration drift
 *
 * Mirrors legacy Daemon.compare_parameters behavior (daemon.py:57-87).
 * Detects when service name, product, or version changes on existing ports.
 *
 * Algorithm:
 * 1. Find ports that exist in both scans (same port+protocol, both open)
 * 2. Compare service.name, service.product, service.version
 * 3. Emit SERVICE_DRIFT notification if any changed
 *
 * Severity mapping (mirrors legacy priority 70):
 * - Product change: MEDIUM (suspicious - potential attack or misconfiguration)
 * - Version/name change: INFO (informational upgrade/downgrade)
 *
 * Fingerprinting (sec-11n):
 * - Includes product+version in fingerprint for proper deduplication
 * - Each unique product/version combination creates separate notification
 *
 * @param current Current scan result summary
 * @param previous Previous baseline scan result summary
 * @param deviceId Device identifier for fingerprinting
 * @returns Array of SERVICE_DRIFT notifications
 */
export function diffServiceDrift(
  current: EnrichedScanResultSummary,
  previous: EnrichedScanResultSummary | null,
  deviceId: string
): ScanChange[] {
  if (!previous) return []; // First scan, no baseline to compare

  const changes: ScanChange[] = [];
  const currentPorts = getPortSnapshots(current);
  const previousPorts = getPortSnapshots(previous);

  // Build maps: "{protocol}/{port}" → port snapshot
  const prevPortMap = new Map(previousPorts.map((p) => [getPortKey(p), p]));
  const currPortMap = new Map(currentPorts.map((p) => [getPortKey(p), p]));

  // Check each port that exists in both scans
  for (const [key, currentPort] of currPortMap.entries()) {
    const prevPort = prevPortMap.get(key);

    // Only compare open ports that existed in baseline
    if (!prevPort || prevPort.state !== 'open' || currentPort.state !== 'open') {
      continue;
    }

    // Check for service drift
    const drifted = hasServiceDrift(prevPort.service, currentPort.service);
    if (!drifted) continue;

    // Create notification using catalog function
    const notification = createServiceDriftNotification({
      port: currentPort.port,
      protocol: currentPort.protocol,
      oldService: prevPort.service,
      newService: currentPort.service,
    });

    // Build fingerprint with product+version (sec-11n)
    // Format: service_drift:{deviceId}:{protocol}:{port}:{product}:{version}
    // This ensures each unique product/version combination creates a separate notification
    const product = currentPort.service?.product || 'unknown';
    const version = currentPort.service?.version || 'unknown';
    const fingerprint = `service_drift:${deviceId}:${currentPort.protocol}:${currentPort.port}:${product}:${version}`;

    changes.push({
      ...notification,
      data: {
        port: currentPort.port,
        protocol: currentPort.protocol,
        oldService: {
          name: prevPort.service?.name,
          product: prevPort.service?.product,
          version: prevPort.service?.version,
        },
        newService: {
          name: currentPort.service?.name,
          product: currentPort.service?.product,
          version: currentPort.service?.version,
        },
      },
      fingerprint,
    });
  }

  return changes;
}

/**
 * Check if service metadata changed between scans
 *
 * Compares service.name, service.product, and service.version fields.
 * Null-safe comparison (treats null and undefined as equivalent).
 *
 * @param oldService Previous scan's service data
 * @param newService Current scan's service data
 * @returns true if any service field changed
 */
function hasServiceDrift(
  oldService: PortSnapshot['service'],
  newService: PortSnapshot['service']
): boolean {
  // Both null/undefined = no drift
  if (!oldService && !newService) return false;

  // One became null = drift (service appeared/disappeared)
  if (!oldService || !newService) return true;

  // Normalize nulls to undefined for comparison
  const oldProduct = oldService.product ?? undefined;
  const newProduct = newService.product ?? undefined;
  const oldVersion = oldService.version ?? undefined;
  const newVersion = newService.version ?? undefined;
  const oldName = oldService.name ?? undefined;
  const newName = newService.name ?? undefined;

  // Check if any field changed
  return (
    oldProduct !== newProduct ||
    oldVersion !== newVersion ||
    oldName !== newName
  );
}

// ============================================================================
// CVE Diffing
// ============================================================================

/**
 * Compare CVE enrichment to detect new vulnerabilities or severity increases
 *
 * Algorithm:
 * 1. Build CVE maps: cveId → CVE object
 * 2. Detect NEW: CVE exists now but not before
 * 3. Detect SEVERITY UPGRADE: CVE severity increased (e.g., MEDIUM → CRITICAL)
 *
 * Returns: Array of change notifications
 */
export function diffCVEs(
  current: EnrichedScanResultSummary,
  previous: EnrichedScanResultSummary | null,
  deviceId: string
): ScanChange[] {
  const changes: ScanChange[] = [];

  const currentCVEs = extractCVEsFromEnrichment(current.cveEnrichment);
  const previousCVEs = extractCVEsFromEnrichment(previous?.cveEnrichment);

  // Build CVE maps: cveId → CVE object
  // CRITICAL: Fixed to use cve.cveId instead of cve.id (review feedback)
  const prevCVEMap = new Map(previousCVEs.map((cve) => [cve.cveId, cve]));

  // Detect NEW CVEs (only CRITICAL/HIGH for noise control)
  for (const cve of currentCVEs) {
    const wasPresent = prevCVEMap.has(cve.cveId);

    if (!wasPresent) {
      // Use catalog function for consistent messaging
      const notification = createNewCVENotification({
        cveId: cve.cveId,
        severity: cve.severity,
        cvssScore: cve.cvssScore,
        description: cve.description,
        affectedService: cve.affectedService,
      });

      // Only notify for HIGH/CRITICAL vulnerabilities (approved noise control)
      if (notification.severity !== 'CRITICAL' && notification.severity !== 'HIGH') {
        continue;
      }

      changes.push({
        ...notification,
        data: {
          cveId: cve.cveId,
          severity: cve.severity,
          cvssScore: cve.cvssScore,
          description: cve.description,
          affectedService: cve.affectedService,
          port: cve.port,
        },
        fingerprint: `new_cve:${deviceId}:${cve.cveId}`,
      });
    }
  }

  // Detect SEVERITY INCREASES (only notify if upgraded to HIGH/CRITICAL)
  for (const cve of currentCVEs) {
    const prevCVE = prevCVEMap.get(cve.cveId);

    if (prevCVE && prevCVE.severity !== cve.severity) {
      const prevSevOrder = getSeverityOrder(prevCVE.severity);
      const currSevOrder = getSeverityOrder(cve.severity);

      // Only notify if severity INCREASED (higher order = more severe)
      if (currSevOrder > prevSevOrder) {
        // Use catalog function for consistent messaging
        const notification = createCVESeverityIncreaseNotification({
          cveId: cve.cveId,
          oldSeverity: prevCVE.severity,
          newSeverity: cve.severity,
          cvssScore: cve.cvssScore,
          description: cve.description,
          affectedService: cve.affectedService,
        });

        // Only notify if upgraded TO HIGH/CRITICAL (approved noise control)
        if (notification.severity !== 'CRITICAL' && notification.severity !== 'HIGH') {
          continue;
        }

        changes.push({
          ...notification,
          data: {
            cveId: cve.cveId,
            oldSeverity: prevCVE.severity,
            newSeverity: cve.severity,
            cvssScore: cve.cvssScore,
            description: cve.description,
            affectedService: cve.affectedService,
            port: cve.port,
          },
          fingerprint: `cve_severity_increase:${deviceId}:${cve.cveId}:${cve.severity}`,
        });
      }
    }
  }

  return changes;
}

/**
 * Extract CVE list from enrichment object
 *
 * Pattern: Normalize CVEs from both OS and application enrichment into flat list
 */
function extractCVEsFromEnrichment(enrichment: any): CVEInfo[] {
  if (!enrichment) return [];

  const cves: CVEInfo[] = [];

  // Parse enrichment using schema validator
  const parsed = safeParseCVEEnrichment(enrichment);
  if (!parsed.success) {
    logger.warn('Failed to parse CVE enrichment', { error: parsed.error });
    return [];
  }

  const data = parsed.data;

  // Extract OS CVEs
  if (data.os?.cves) {
    for (const cve of data.os.cves) {
      cves.push({
        cveId: cve.cveId,
        severity: cve.severity,
        cvssScore: cve.cvssScore,
        description: cve.description,
        affectedService: data.os.product,
      });
    }
  }

  // Extract application CVEs
  if (data.applications) {
    for (const app of data.applications) {
      for (const cve of app.cves || []) {
        cves.push({
          cveId: cve.cveId,
          severity: cve.severity,
          cvssScore: cve.cvssScore,
          description: cve.description,
          affectedService: `${app.name} ${app.version || ''}`.trim(),
          port: app.port,
        });
      }
    }
  }

  return cves;
}

// ============================================================================
// Main Change Detection
// ============================================================================

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

  // Step 1: Get baseline scan for comparison
  const baseline = await getBaselineScan(
    deviceId,
    currentScan.id,
    organizationId
  );

  // Edge Case: First successful scan - no baseline to compare against
  if (!baseline) {
    logger.info('[Change Detection] No baseline scan found - first successful scan', {
      deviceId,
      scanRunId: currentScan.id,
    });
    return [];
  }

  // Step 2: Extract result summaries
  const currentSummary = currentScan.resultSummary as EnrichedScanResultSummary | null;
  const baselineSummary = baseline.resultSummary as EnrichedScanResultSummary | null;

  if (!currentSummary) {
    logger.warn('[Change Detection] Current scan has no result summary', {
      scanRunId: currentScan.id,
    });
    return [];
  }

  // Step 3: Run port, CVE, and service drift diffs
  const portChanges = diffPorts(currentSummary, baselineSummary, deviceId);
  const cveChanges = diffCVEs(currentSummary, baselineSummary, deviceId);
  const serviceDriftChanges = diffServiceDrift(currentSummary, baselineSummary, deviceId);

  const allChanges = [...portChanges, ...cveChanges, ...serviceDriftChanges];

  logger.info('[Change Detection] Changes detected', {
    deviceId,
    currentScanId: currentScan.id,
    baselineScanId: baseline.id,
    portChanges: portChanges.length,
    cveChanges: cveChanges.length,
    serviceDriftChanges: serviceDriftChanges.length,
    total: allChanges.length,
  });

  return allChanges;
}

// ============================================================================
// Helper Functions
// ============================================================================

// NOTE: Port severity, security messages, CVE severity mapping, and severity order
// are now centralized in the catalog module (packages/data-ops/src/notifications/catalog.ts).
// This change-detector.ts now uses catalog functions for all notification generation.
