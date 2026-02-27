import type { PortSnapshot } from '@repo/data-ops';

/**
 * Shared Utilities
 *
 * Helper functions used across multiple change detection modules.
 */

/**
 * Extract service fingerprint parts for consistent deduplication (sec-11n)
 *
 * Returns normalized product, version, and name for use in notification fingerprints.
 * Uses 'unknown' as default to distinguish missing metadata from known values.
 *
 * @param service Port service metadata (may be null)
 * @returns Normalized {product, version, name} tuple
 */
export function buildServiceFingerprintParts(service: PortSnapshot['service'] | null | undefined): {
  product: string;
  version: string;
  name: string;
} {
  return {
    product: service?.product ?? 'unknown',
    version: service?.version ?? 'unknown',
    name: service?.name ?? 'unknown',
  };
}

/**
 * Generate port key for mapping
 *
 * @param port Port snapshot with protocol and port number
 * @returns Key in format "{protocol}/{port}"
 */
export function getPortKey(port: Pick<PortSnapshot, 'protocol' | 'port'>): string {
  return `${port.protocol}/${port.port}`;
}
