import type { EnrichedScanResultSummary } from '@repo/data-ops';
import { safeParseCVEEnrichment } from '@repo/data-ops';
import {
  createNewCVENotification,
  createCVESeverityIncreaseNotification,
  createCVEFixedNotification,
  createCVERegressedNotification,
  getSeverityOrder,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import type { ScanChange, CVEInfo } from './types';

const logger = createLogger({ name: 'change-detector-cves' });

/**
 * CVE Lifecycle Detection (sec-5gu)
 *
 * Detects vulnerability lifecycle events: new CVEs, severity increases, fixes, and regressions.
 * Mirrors legacy "critical_fix / critical_unfix" pattern.
 */

/**
 * Compare CVE enrichment to detect vulnerability lifecycle events
 *
 * Algorithm:
 * 1. Build CVE maps: cveId → CVE object
 * 2. Detect NEW: CVE exists now but not before
 * 3. Detect SEVERITY UPGRADE: CVE severity increased (e.g., MEDIUM → CRITICAL)
 * 4. Detect FIXED: CVE existed in previous scan but absent now
 * 5. Detect REGRESSED: CVE returns after being fixed (3-scan comparison)
 *
 * Mirrors legacy "critical_fix / critical_unfix" pattern (sec-5gu).
 *
 * Regression Detection (MVP):
 * - Requires 3 scans: scan N-2 (had CVE), scan N-1 (CVE fixed), scan N (CVE returned)
 * - If previousPrevious is provided, checks if "new" CVEs were absent in previous but present in previousPrevious
 * - Without previousPrevious, all "new" CVEs emit NEW_CVE (cannot distinguish from regressions)
 *
 * Returns: Array of change notifications
 */
export function diffCVEs(
  current: EnrichedScanResultSummary,
  previous: EnrichedScanResultSummary | null,
  deviceId: string,
  previousPrevious?: EnrichedScanResultSummary | null
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

  // Detect CVE FIXES (present in previous scan, absent now)
  // Mirrors legacy "critical_fix" pattern
  for (const prevCVE of previousCVEs) {
    const stillPresent = currentCVEs.find((cve) => cve.cveId === prevCVE.cveId);
    if (!stillPresent) {
      const notification = createCVEFixedNotification({
        cveId: prevCVE.cveId,
        severity: prevCVE.severity,
        cvssScore: prevCVE.cvssScore,
        affectedService: prevCVE.affectedService,
      });

      changes.push({
        ...notification,
        data: {
          cveId: prevCVE.cveId,
          severity: prevCVE.severity,
          cvssScore: prevCVE.cvssScore,
          affectedService: prevCVE.affectedService,
          port: prevCVE.port,
        },
        fingerprint: `cve_fixed:${deviceId}:${prevCVE.cveId}`,
      });
    }
  }

  // Detect CVE REGRESSIONS (3-scan comparison)
  // Mirrors legacy "critical_unfix" pattern
  //
  // A CVE is considered regressed if:
  // - Present in scan N-2 (or earlier)
  // - Absent in scan N-1 (was fixed)
  // - Returns in scan N (current scan)
  //
  // This requires previousPrevious scan context. Without it, we cannot distinguish
  // regressions from first-time appearances, so all "new" CVEs emit NEW_CVE.
  if (previousPrevious) {
    const prevPrevCVEs = extractCVEsFromEnrichment(previousPrevious.cveEnrichment);
    const prevPrevCVEMap = new Map(prevPrevCVEs.map((cve) => [cve.cveId, cve]));

    for (const cve of currentCVEs) {
      // Skip CVEs that were in previous scan (already handled by NEW_CVE or SEVERITY_INCREASE)
      if (prevCVEMap.has(cve.cveId)) {
        continue;
      }

      // Check if CVE was present in scan N-2
      const wasInPrevPrev = prevPrevCVEMap.has(cve.cveId);
      if (wasInPrevPrev) {
        // This is a regression: CVE was in N-2, absent in N-1 (fixed), returned in N
        const notification = createCVERegressedNotification({
          cveId: cve.cveId,
          severity: cve.severity,
          cvssScore: cve.cvssScore,
          affectedService: cve.affectedService,
        });

        // Apply same noise control as NEW_CVE (only HIGH/CRITICAL)
        if (notification.severity !== 'CRITICAL' && notification.severity !== 'HIGH') {
          continue;
        }

        changes.push({
          ...notification,
          data: {
            cveId: cve.cveId,
            severity: cve.severity,
            cvssScore: cve.cvssScore,
            affectedService: cve.affectedService,
            port: cve.port,
          },
          fingerprint: `cve_regressed:${deviceId}:${cve.cveId}`,
        });
      }
      // Note: If CVE not in previous OR previousPrevious, it's truly new (NEW_CVE already emitted above)
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
