/**
 * Port Merging Utilities
 *
 * Combines port scan results from multiple scanners (masscan, rustscan, nmap)
 * with proper attribution and timestamp handling.
 */

import type { DiscoveredPort } from './scanners/masscan';

/**
 * Utility functions for timestamp handling
 */
function earliestTimestamp(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number');
  if (defined.length === 0) {
    return undefined;
  }
  return Math.min(...defined);
}

function latestTimestamp(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number');
  if (defined.length === 0) {
    return undefined;
  }
  return Math.max(...defined);
}

/**
 * Combines multiple arrays of port scan results into a single deduplicated array
 *
 * When the same port is found by multiple scanners:
 * - Merges discoveredBy arrays (e.g., ["masscan", "rustscan"])
 * - Takes earliest firstSeen timestamp
 * - Takes latest lastSeen timestamp
 * - Prefers service info from nmap over prescans
 */
export function combinePortDiscoveries(...sources: DiscoveredPort[][]): DiscoveredPort[] {
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
            : [],
        });
        continue;
      }

      // Merge with existing discovery
      const discovered = new Set<string>([
        ...(existing.discoveredBy ?? []),
        ...(port.discoveredBy ?? []),
      ]);

      combined.set(key, {
        ...existing,
        // Prefer existing service info (nmap) over new (prescan)
        service: existing.service ?? port.service,
        discoveredBy: Array.from(discovered),
        firstSeen: earliestTimestamp(existing.firstSeen, port.firstSeen) ?? existing.firstSeen,
        lastSeen: latestTimestamp(existing.lastSeen, port.lastSeen) ?? existing.lastSeen,
      });
    }
  }

  return Array.from(combined.values());
}

/**
 * Extracts unique port numbers from discovered ports
 * Returns sorted array of valid port numbers (1-65535)
 */
export function extractPortNumbers(discoveredPorts: DiscoveredPort[]): number[] {
  const ports = new Set<number>();

  for (const port of discoveredPorts) {
    if (Number.isInteger(port.port) && port.port >= 1 && port.port <= 65535) {
      ports.add(port.port);
    }
  }

  return Array.from(ports.values()).sort((a, b) => a - b);
}

/**
 * Converts port numbers to nmap port specification string
 * Examples:
 * - [80, 443, 8080] → "80,443,8080"
 * - [22, 23, 24, 25] → "22-25"
 * - [22, 80, 443, 8080, 8081, 8082] → "22,80,443,8080-8082"
 */
export function formatPortSpec(ports: number[]): string {
  if (ports.length === 0) {
    return '';
  }

  const sorted = [...ports].sort((a, b) => a - b);
  const segments: string[] = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];

    if (current === previous + 1) {
      // Continue range
      previous = current;
      continue;
    }

    // End range
    if (rangeStart === previous) {
      segments.push(`${rangeStart}`);
    } else {
      segments.push(`${rangeStart}-${previous}`);
    }

    rangeStart = current;
    previous = current;
  }

  // Add final range
  if (rangeStart === previous) {
    segments.push(`${rangeStart}`);
  } else {
    segments.push(`${rangeStart}-${previous}`);
  }

  return segments.join(',');
}
