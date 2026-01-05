/**
 * Worker-safe IP address utilities
 *
 * These utilities don't rely on Node.js net module and work in Cloudflare Workers.
 */

/**
 * Check if a string is a valid IPv4 address
 */
export function isIPv4(str: string): boolean {
  const parts = str.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    // Must be all digits
    if (!/^\d+$/.test(part)) return false;

    const num = Number(part);

    // Must be 0-255
    if (num < 0 || num > 255) return false;

    // No leading zeros (e.g., "01" is invalid, but "0" is valid)
    if (String(num) !== part) return false;

    return true;
  });
}

/**
 * Check if a string is a valid IPv6 address
 * Simplified version - handles common cases, not all edge cases
 */
export function isIPv6(str: string): boolean {
  // Handle IPv6 with zone ID (e.g., fe80::1%eth0)
  const withoutZone = str.split('%')[0];

  // Basic IPv6 patterns:
  // - Full form: 2001:0db8:0000:0000:0000:ff00:0042:8329
  // - Compressed: 2001:db8::ff00:42:8329
  // - Loopback: ::1
  // - IPv4-mapped: ::ffff:192.0.2.1

  // Must contain at least one colon
  if (!withoutZone.includes(':')) return false;

  // Split by ::
  const parts = withoutZone.split('::');

  // Can have at most one :: (zero compression)
  if (parts.length > 2) return false;

  // If we have ::, validate both sides
  if (parts.length === 2) {
    const [left, right] = parts;

    // Both sides empty is only valid for ::1 or ::
    if (left === '' && right === '') {
      return true; // :: is valid (all zeros)
    }

    // Validate each side if not empty
    if (left && !isValidIPv6Segment(left)) return false;
    if (right && !isValidIPv6Segment(right)) return false;

    return true;
  }

  // No :: compression, must have exactly 8 groups
  return isValidIPv6Segment(withoutZone) && withoutZone.split(':').length === 8;
}

/**
 * Helper: Validate IPv6 segment (no :: compression)
 */
function isValidIPv6Segment(segment: string): boolean {
  const groups = segment.split(':');

  // Each group must be 0-4 hex digits
  return groups.every((group) => {
    if (group.length === 0 || group.length > 4) return false;
    return /^[0-9a-fA-F]+$/.test(group);
  });
}

/**
 * Check if a string is a valid IP address (v4 or v6)
 */
export function isIP(str: string): boolean {
  return isIPv4(str) || isIPv6(str);
}

/**
 * Convert IPv4 address to PTR query format
 * Example: 192.0.2.1 → 1.2.0.192.in-addr.arpa
 */
export function ipv4ToPtr(ip: string): string {
  if (!isIPv4(ip)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }

  return ip.split('.').reverse().join('.') + '.in-addr.arpa';
}

/**
 * Convert IPv6 address to PTR query format
 * Example: 2001:db8::1 → 1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa
 *
 * Simplified implementation - expands compressed addresses
 */
export function ipv6ToPtr(ip: string): string {
  if (!isIPv6(ip)) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  // Remove zone ID if present
  const withoutZone = ip.split('%')[0];

  // Expand :: compression
  const expanded = expandIPv6(withoutZone);

  // Remove colons and reverse nibbles
  const nibbles = expanded.replace(/:/g, '').split('').reverse().join('.');

  return nibbles + '.ip6.arpa';
}

/**
 * Helper: Expand IPv6 address (fill in :: compression)
 */
function expandIPv6(ip: string): string {
  // If no ::, it's already expanded
  if (!ip.includes('::')) {
    // Just pad each group to 4 digits
    return ip.split(':').map(g => g.padStart(4, '0')).join(':');
  }

  const [left, right] = ip.split('::');
  const leftGroups = left ? left.split(':') : [];
  const rightGroups = right ? right.split(':') : [];

  // Total groups should be 8
  const missingGroups = 8 - leftGroups.length - rightGroups.length;
  const zeros = Array(missingGroups).fill('0000');

  const allGroups = [
    ...leftGroups.map(g => g.padStart(4, '0')),
    ...zeros,
    ...rightGroups.map(g => g.padStart(4, '0')),
  ];

  return allGroups.join(':');
}

/**
 * Convert IP address to PTR query format (auto-detects v4/v6)
 */
export function ipToPtr(ip: string): string {
  if (isIPv4(ip)) {
    return ipv4ToPtr(ip);
  }
  if (isIPv6(ip)) {
    return ipv6ToPtr(ip);
  }
  throw new Error(`Invalid IP address: ${ip}`);
}
