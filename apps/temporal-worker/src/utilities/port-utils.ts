import type { DiscoveredPort } from '@repo/temporal/contracts';

/**
 * Port validation and manipulation utilities
 *
 * Pure functions for sanitizing, merging, and extracting port lists.
 * These utilities are used throughout the scanning workflow for
 * consistent port handling.
 */

/**
 * Validates a single port number
 */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Sanitizes a list of port numbers, removing invalid ports and duplicates
 *
 * @param ports - Array of port numbers to sanitize
 * @returns Sorted, deduplicated array of valid ports, or undefined if none valid
 */
export function sanitizePortList(ports?: number[]): number[] | undefined {
  if (!ports || ports.length === 0) {
    return undefined;
  }

  const normalized = ports.filter(isValidPort);
  if (normalized.length === 0) {
    return undefined;
  }

  const unique = Array.from(new Set(normalized));
  unique.sort((a, b) => a - b);
  return unique;
}

/**
 * Merges multiple port lists into a single deduplicated, sorted list
 *
 * @param lists - Variable number of port arrays to merge
 * @returns Merged and sorted port list, or undefined if no valid ports
 */
export function mergePortLists(...lists: Array<number[] | undefined>): number[] | undefined {
  const merged = new Set<number>();

  for (const list of lists) {
    if (!list || list.length === 0) {
      continue;
    }

    for (const port of list) {
      if (isValidPort(port)) {
        merged.add(port);
      }
    }
  }

  if (merged.size === 0) {
    return undefined;
  }

  return Array.from(merged).sort((a, b) => a - b);
}

/**
 * Sanitizes a list of string values, removing empty/invalid strings
 *
 * @param values - Array of strings to sanitize
 * @returns Sorted, deduplicated array of non-empty strings, or undefined if none valid
 */
export function sanitizeStringList(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const sanitized = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  if (sanitized.length === 0) {
    return undefined;
  }

  const unique = Array.from(new Set(sanitized));
  unique.sort();
  return unique;
}

/**
 * Extracts port numbers from scan results
 *
 * @param results - Array of port scan results
 * @returns Sorted array of port numbers, or undefined if no valid ports
 */
export function extractPortNumbers(results?: DiscoveredPort[]): number[] | undefined {
  if (!results || results.length === 0) {
    return undefined;
  }

  const ports = new Set<number>();
  for (const result of results) {
    if (isValidPort(result.port)) {
      ports.add(result.port);
    }
  }

  if (ports.size === 0) {
    return undefined;
  }

  return Array.from(ports.values()).sort((a, b) => a - b);
}

/**
 * Port validation constants
 */
export const PORT_CONSTANTS = {
  MIN_PORT: 1,
  MAX_PORT: 65535,
} as const;
