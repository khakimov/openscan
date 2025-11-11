import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';
import {
  createNewPortNotification,
  createClosedPortNotification,
} from '@repo/data-ops';
import type { ScanChange } from './types';
import { buildServiceFingerprintParts, getPortKey } from './utils';

/**
 * Port Diffing
 *
 * Detects new and closed ports by comparing current scan against previous baseline.
 */

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

      // Build fingerprint with service metadata (sec-11n)
      // Format: new_port:{deviceId}:{protocol}:{port}:{product}:{version}:{name}
      // Mirrors SERVICE_DRIFT pattern to prevent deduplication when port reopens with different service
      // Legacy hashed full message (which included product/version), this achieves same dedupe behavior
      const { product, version, name } = buildServiceFingerprintParts(port.service);
      const fingerprint = `new_port:${deviceId}:${port.protocol}:${port.port}:${product}:${version}:${name}`;

      changes.push({
        ...notification,
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          state: port.state,
          version: serviceVersion,
        },
        fingerprint,
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

      // Build fingerprint with service metadata (sec-11n)
      // Format: closed_port:{deviceId}:{protocol}:{port}:{product}:{version}:{name}
      // Use metadata from baseline snapshot (port variable in this loop = previous scan)
      // Mirrors NEW_PORT and SERVICE_DRIFT patterns for consistent deduplication
      const { product, version, name } = buildServiceFingerprintParts(port.service);
      const fingerprint = `closed_port:${deviceId}:${port.protocol}:${port.port}:${product}:${version}:${name}`;

      changes.push({
        ...notification,
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          previousState: port.state,
          currentState: currentPort?.state || 'closed',
        },
        fingerprint,
      });
    }
  }

  return changes;
}

function getPortSnapshots(summary: EnrichedScanResultSummary | null): PortSnapshot[] {
  if (!summary?.portSnapshots) return [];
  return summary.portSnapshots;
}
