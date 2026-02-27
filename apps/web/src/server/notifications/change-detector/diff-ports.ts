import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';
import {
  createNewPortNotification,
  createClosedPortNotification,
  createServiceDownNotification,
  createServiceUpNotification,
  STANDARD_PORTS_ALLOWLIST,
} from '@repo/data-ops';
import type { ScanChange } from './types';
import { buildServiceFingerprintParts, getPortKey } from './utils';

/**
 * Port Diffing
 *
 * Detects new and closed ports by comparing current scan against previous baseline.
 */

/**
 * Compare port scan results to detect new/closed ports and service availability changes
 *
 * Algorithm:
 * 1. Build maps: port+protocol → state
 * 2. Detect NEW: port now "open" but was not open before (or didn't exist)
 * 3. Detect CLOSED: port was "open" before but now closed/filtered/missing
 * 4. Detect SERVICE_DOWN: port was open in previous scan, now not open (availability)
 * 5. Detect SERVICE_UP: port was not open in previous scan, now open (recovery)
 *
 * Returns: Array of change notifications
 */
export function diffPorts(
  current: EnrichedScanResultSummary,
  previous: EnrichedScanResultSummary | null,
  deviceId: string,
  deviceName?: string
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
      // Skip notification for standard ports (80, 443, 8080, 8443)
      // These are expected on most web servers and would create noise
      if (STANDARD_PORTS_ALLOWLIST.has(port.port)) {
        continue;
      }

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
      // Skip notification for standard ports (expected infrastructure)
      // Mirrors NEW_PORT filtering to avoid noise from common services going offline
      if (STANDARD_PORTS_ALLOWLIST.has(port.port)) {
        continue;
      }

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

  // Detect SERVICE AVAILABILITY changes (SERVICE_DOWN / SERVICE_UP)
  // This is separate from NEW/CLOSED because it tracks state transitions for already-known ports
  // Pattern matches legacy: daemon.is_up() && status == DOWN → Notification.down_status_app(daemon)
  if (previous && deviceName) {
    for (const port of previousPorts) {
      const key = getPortKey(port);
      const currentPort = currPortMap.get(key);

      // Skip if port doesn't exist in both scans (not a state transition)
      if (!currentPort) continue;

      const wasOpen = port.state === 'open';
      const isNowOpen = currentPort.state === 'open';

      // SERVICE_DOWN: was open, now not open
      if (wasOpen && !isNowOpen) {
        const serviceName = port.service?.name ?? port.service?.product ?? undefined;
        const notification = createServiceDownNotification({
          deviceName,
          port: port.port,
          protocol: port.protocol,
          serviceName,
          previousState: port.state,
          currentState: currentPort.state,
        });

        // Fingerprint: service_down:{deviceId}:{protocol}:{port}
        // Shorter window than NEW_PORT (15min vs 6h) to quickly alert on outages
        const fingerprint = `service_down:${deviceId}:${port.protocol}:${port.port}`;

        changes.push({
          ...notification,
          data: {
            port: port.port,
            protocol: port.protocol,
            service: serviceName,
            previousState: port.state,
            currentState: currentPort.state,
          },
          fingerprint,
        });
      }

      // SERVICE_UP: was not open, now open (recovery)
      if (!wasOpen && isNowOpen) {
        const serviceName = currentPort.service?.name ?? currentPort.service?.product ?? undefined;
        const notification = createServiceUpNotification({
          deviceName,
          port: currentPort.port,
          protocol: currentPort.protocol,
          serviceName,
          previousState: port.state,
          currentState: currentPort.state,
        });

        // Fingerprint: service_up:{deviceId}:{protocol}:{port}
        const fingerprint = `service_up:${deviceId}:${currentPort.protocol}:${currentPort.port}`;

        changes.push({
          ...notification,
          data: {
            port: currentPort.port,
            protocol: currentPort.protocol,
            service: serviceName,
            previousState: port.state,
            currentState: currentPort.state,
          },
          fingerprint,
        });
      }
    }
  }

  return changes;
}

function getPortSnapshots(summary: EnrichedScanResultSummary | null): PortSnapshot[] {
  if (!summary?.portSnapshots) return [];
  return summary.portSnapshots;
}
