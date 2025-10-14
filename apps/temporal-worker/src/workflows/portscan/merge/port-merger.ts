import type { DiscoveredPort } from '@repo/temporal/contracts';

/**
 * Nmap scan result type (used by merger)
 */
export interface NmapScanResult {
  ports: DiscoveredPort[];
}

/**
 * Port merging and result combination utilities
 *
 * This module handles the complex logic of combining port scan results
 * from different sources (Masscan, RustScan, Nmap) while preserving
 * discovery attribution and timing information.
 */

/**
 * Utility functions for timestamp handling
 */
export function earliestTimestamp(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number');
  if (defined.length === 0) {
    return undefined;
  }
  return Math.min(...defined);
}

export function latestTimestamp(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number');
  if (defined.length === 0) {
    return undefined;
  }
  return Math.max(...defined);
}

/**
 * Combines multiple arrays of prescan port results into a single deduplicated array
 *
 * @param sources - Variable number of port result arrays to combine
 * @returns Combined array with merged discovery attribution
 */
export function combinePreScanPorts(
  ...sources: DiscoveredPort[][]
): DiscoveredPort[] {
  const combined = new Map<string, DiscoveredPort>();

  for (const source of sources) {
    for (const port of source) {
      const key = `${port.protocol}:${port.port}`;
      const existing = combined.get(key);

      if (!existing) {
        combined.set(key, {
          ...port,
          discoveredBy: port.discoveredBy
            ? Array.from(new Set(port.discoveredBy))
            : undefined,
        });
        continue;
      }

      const discovered = new Set<string>([
        ...(existing.discoveredBy ?? []),
        ...(port.discoveredBy ?? []),
      ]);

      combined.set(key, {
        ...existing,
        service: existing.service ?? port.service,
        discoveredBy: discovered.size ? Array.from(discovered) : undefined,
        firstSeen: earliestTimestamp(existing.firstSeen, port.firstSeen),
        lastSeen: latestTimestamp(existing.lastSeen, port.lastSeen),
      });
    }
  }

  return Array.from(combined.values());
}

/**
 * Derives additional ports for Nmap scanning from prescan results and hints
 *
 * @param prescanPorts - Results from prescans (Masscan, RustScan)
 * @param prescanHints - Additional port hints from input
 * @returns Sorted array of ports for Nmap to scan
 */
export function deriveAdditionalPortsForNmap(
  prescanPorts: DiscoveredPort[],
  prescanHints?: number[],
): number[] {
  const ports = new Set<number>();

  for (const port of prescanPorts) {
    if (Number.isInteger(port.port) && port.port >= 1 && port.port <= 65535) {
      ports.add(port.port);
    }
  }

  if (prescanHints && prescanHints.length > 0) {
    for (const hint of prescanHints) {
      if (Number.isInteger(hint) && hint >= 1 && hint <= 65535) {
        ports.add(hint);
      }
    }
  }

  if (ports.size === 0) {
    return [];
  }

  return Array.from(ports.values()).sort((a, b) => a - b);
}

/**
 * Merges prescan discoveries into Nmap scan results
 *
 * This function enriches Nmap results with information discovered during
 * prescans, ensuring that all discovered ports are included in the final
 * result set with proper attribution.
 *
 * Returns a new NmapScanResult object without mutating the input.
 *
 * @param scanResult - Nmap scan result to enrich
 * @param prescanPorts - Combined prescan results to merge
 * @returns New enhanced Nmap result with merged discoveries
 */
export function mergePreScanDiscoveries(
  scanResult: NmapScanResult,
  prescanPorts: DiscoveredPort[],
): NmapScanResult {
  if (!prescanPorts.length) {
    return scanResult;
  }

  const fallbackTimestamp = Math.floor(Date.now() / 1000);
  const prescanMap = new Map<string, DiscoveredPort>();
  for (const port of prescanPorts) {
    prescanMap.set(`${port.protocol}:${port.port}`, port);
  }

  const existingKeys = new Set<string>();

  const enrichedPorts = scanResult.ports.map((port) => {
    const key = `${port.protocol}:${port.port}`;
    existingKeys.add(key);

    const prescan = prescanMap.get(key);
    if (!prescan) {
      const discoveredBy = new Set<string>(port.discoveredBy ?? []);
      discoveredBy.add('nmap');
      return {
        ...port,
        discoveredBy: Array.from(discoveredBy),
      };
    }

    const discoveredBy = new Set<string>([
      ...(port.discoveredBy ?? []),
      ...(prescan.discoveredBy ?? []),
      'nmap',
    ]);

    return {
      ...port,
      service: port.service ?? prescan.service,
      discoveredBy: Array.from(discoveredBy),
      firstSeen: earliestTimestamp(port.firstSeen, prescan.firstSeen) ?? fallbackTimestamp,
      lastSeen: latestTimestamp(port.lastSeen, prescan.lastSeen) ?? fallbackTimestamp,
    };
  });

  const supplementalPorts = prescanPorts
    .filter((port) => !existingKeys.has(`${port.protocol}:${port.port}`))
    .map((port) => {
      const discoveredBy = new Set<string>(port.discoveredBy ?? []);
      if (!discoveredBy.size) {
        discoveredBy.add('prescan');
      }

      return {
        port: port.port,
        protocol: port.protocol,
        state: port.state,
        service: port.service,
        discoveredBy: Array.from(discoveredBy),
        firstSeen: port.firstSeen ?? fallbackTimestamp,
        lastSeen: port.lastSeen ?? fallbackTimestamp,
      };
    });

  const mergedPorts = supplementalPorts.length > 0
    ? [...enrichedPorts, ...supplementalPorts]
    : enrichedPorts;

  // Return new object without mutating input
  return {
    ...scanResult,
    ports: mergedPorts,
  };
}

/**
 * Annotates Nmap ports with discovery information and timestamps
 *
 * Returns a new NmapScanResult object without mutating the input.
 *
 * @param scanResult - Nmap scan result to annotate
 * @returns New annotated Nmap result
 */
export function annotateNmapPorts(scanResult: NmapScanResult): NmapScanResult {
  const timestamp = Math.floor(Date.now() / 1000);
  const annotatedPorts = scanResult.ports.map((port) => {
    const discoveredBy = new Set<string>(port.discoveredBy ?? []);
    discoveredBy.add('nmap');

    return {
      ...port,
      discoveredBy: Array.from(discoveredBy),
      firstSeen: port.firstSeen ?? timestamp,
      lastSeen: timestamp,
    };
  });

  // Return new object without mutating input
  return {
    ...scanResult,
    ports: annotatedPorts,
  };
}
