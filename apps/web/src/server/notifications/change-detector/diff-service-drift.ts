import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';
import { createServiceDriftNotification } from '@repo/data-ops';
import type { ScanChange } from './types';
import { buildServiceFingerprintParts, getPortKey } from './utils';

/**
 * Service Drift Detection (sec-8sh)
 *
 * Detects when service metadata changes on existing ports.
 * Mirrors legacy Daemon.compare_parameters behavior (daemon.py:57-87).
 */

/**
 * Compare port service metadata to detect configuration drift
 *
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
 * - Includes product+version+name in fingerprint for proper deduplication
 * - Each unique product/version/name combination creates separate notification
 * - Prevents false deduplication when only service name changes (e.g., http → https)
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

    // Build fingerprint with product+version+name (sec-11n)
    // Format: service_drift:{deviceId}:{protocol}:{port}:{product}:{version}:{name}
    // This ensures each unique product/version/name combination creates a separate notification
    // Including name prevents deduplication when only service name changes (e.g., http → https)
    const { product, version, name } = buildServiceFingerprintParts(currentPort.service);
    const fingerprint = `service_drift:${deviceId}:${currentPort.protocol}:${currentPort.port}:${product}:${version}:${name}`;

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

function getPortSnapshots(summary: EnrichedScanResultSummary | null): PortSnapshot[] {
  if (!summary?.portSnapshots) return [];
  return summary.portSnapshots;
}
