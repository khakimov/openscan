/**
 * Discovery Target Validation (sec-27)
 *
 * Provides secure validation for discovery targets before passing to external tools.
 * This is a critical security boundary - all external inputs MUST be validated here.
 *
 * Security features:
 * - Blocks shell metacharacters to prevent command injection
 * - Validates format using strict regex patterns
 * - Type-safe validation (domain vs IP vs CIDR)
 * - Descriptive error messages for debugging
 */

export type TargetType = 'DOMAIN' | 'IP' | 'CIDR';

/**
 * Validates a discovery target based on its expected type
 *
 * @param target - The target string to validate
 * @param type - Expected type (DOMAIN, IP, or CIDR)
 * @returns true if valid
 * @throws Error with descriptive message if invalid
 *
 * @example
 * validateDiscoveryTarget('example.com', 'DOMAIN'); // OK
 * validateDiscoveryTarget('192.168.1.1', 'IP'); // OK
 * validateDiscoveryTarget('example.com; rm -rf /', 'DOMAIN'); // throws
 */
export function validateDiscoveryTarget(target: string, type: TargetType): boolean {
  // Step 1: Basic validation
  if (!target || target.trim().length === 0) {
    throw new Error('Invalid target: empty or whitespace-only');
  }

  // Check for leading/trailing whitespace
  if (target !== target.trim()) {
    throw new Error(`Invalid target: contains leading or trailing whitespace: "${target}"`);
  }

  // Check for null bytes
  if (target.includes('\0')) {
    throw new Error(`Invalid target: contains null byte: "${target}"`);
  }

  // Length validation
  if (target.length > 253) {
    throw new Error(`Invalid target: too long (max 253 characters): "${target}"`);
  }

  // Step 2: Shell metacharacter protection (CRITICAL SECURITY)
  const dangerousChars = /[;&|$`<>(){}[\]\\!#*?'"]/;
  if (dangerousChars.test(target)) {
    const matches = target.match(dangerousChars);
    throw new Error(
      `Invalid target: contains shell metacharacter or dangerous character "${matches?.[0]}": "${target}"`
    );
  }

  // Check for newlines
  if (/[\n\r]/.test(target)) {
    throw new Error(`Invalid target: contains shell metacharacter (newline): "${target}"`);
  }

  // Step 3: Type-specific validation
  switch (type) {
    case 'DOMAIN':
      return validateDomain(target);
    case 'IP':
      return validateIP(target);
    case 'CIDR':
      return validateCIDR(target);
    default:
      throw new Error(`Unknown target type: ${type}`);
  }
}

/**
 * Validates domain name format
 * Follows RFC 1035 and RFC 1123 rules
 */
function validateDomain(domain: string): boolean {
  // Check for consecutive dots, leading/trailing dots
  if (domain.includes('..') || domain.startsWith('.') || domain.endsWith('.')) {
    throw new Error(`Invalid domain format (consecutive or leading/trailing dots): "${domain}"`);
  }

  // Check if it's an IP address being passed as domain (BEFORE regex check)
  if (isIPv4(domain) || isIPv6(domain)) {
    throw new Error(`Invalid target: expected DOMAIN but got IP address: "${domain}"`);
  }

  // Validate individual labels BEFORE regex (for better error messages)
  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length > 63) {
      throw new Error(`Invalid domain: label too long (max 63 chars): "${label}" in "${domain}"`);
    }
  }

  // Domain regex based on RFC 1035/1123
  // - Labels can contain letters, numbers, and hyphens
  // - Labels cannot start or end with hyphen
  // - Labels are separated by dots
  // - Must be ASCII (punycode required for internationalized domains)
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

  if (!domainRegex.test(domain)) {
    // Check if it contains non-ASCII characters
    if (/[^\x00-\x7F]/.test(domain)) {
      throw new Error(
        `Invalid domain format (non-ASCII characters - use punycode encoding): "${domain}"`
      );
    }

    throw new Error(`Invalid domain format: "${domain}"`);
  }

  return true;
}

/**
 * Validates IP address (IPv4 or IPv6)
 */
function validateIP(ip: string): boolean {
  // Check if it's a CIDR range
  if (ip.includes('/')) {
    throw new Error(`Invalid target: expected IP but got CIDR range: "${ip}"`);
  }

  // Check if it's a domain
  if (!isIPv4(ip) && !isIPv6(ip)) {
    // Might be a domain name
    if (/^[a-z0-9.-]+$/i.test(ip)) {
      throw new Error(`Invalid target: expected IP but got domain name: "${ip}"`);
    }
    throw new Error(`Invalid IP address format: "${ip}"`);
  }

  if (isIPv4(ip)) {
    return validateIPv4(ip);
  } else {
    return validateIPv6(ip);
  }
}

/**
 * Validates IPv4 address
 */
function validateIPv4(ip: string): boolean {
  const parts = ip.split('.');

  if (parts.length !== 4) {
    throw new Error(`Invalid IPv4 address (must have 4 octets): "${ip}"`);
  }

  for (const part of parts) {
    // Check if numeric
    if (!/^\d+$/.test(part)) {
      throw new Error(`Invalid IPv4 address (non-numeric octet): "${ip}"`);
    }

    const num = parseInt(part, 10);
    if (num < 0 || num > 255) {
      throw new Error(`Invalid IPv4 address (octet out of range 0-255): "${ip}"`);
    }
  }

  return true;
}

/**
 * Validates IPv6 address
 */
function validateIPv6(ip: string): boolean {
  // Remove zone ID if present (e.g., fe80::1%eth0)
  const ipWithoutZone = ip.split('%')[0];

  // IPv6 regex (simplified - covers most common cases)
  const ipv6Regex =
    /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i;

  if (!ipv6Regex.test(ipWithoutZone)) {
    throw new Error(`Invalid IPv6 address format: "${ip}"`);
  }

  // Check for too many consecutive colons (more than 2)
  if (/:{3,}/.test(ipWithoutZone)) {
    throw new Error(`Invalid IPv6 address format (too many consecutive colons): "${ip}"`);
  }

  return true;
}

/**
 * Validates CIDR range
 */
function validateCIDR(cidr: string): boolean {
  const parts = cidr.split('/');

  if (parts.length !== 2) {
    throw new Error(`Invalid target: expected CIDR range (IP/prefix) but got: "${cidr}"`);
  }

  const [ipPart, prefixPart] = parts;

  // Validate prefix length
  if (!/^\d+$/.test(prefixPart)) {
    throw new Error(`Invalid CIDR range (non-numeric prefix): "${cidr}"`);
  }

  const prefix = parseInt(prefixPart, 10);

  // Determine if IPv4 or IPv6 based on IP part
  if (isIPv4(ipPart)) {
    if (prefix < 0 || prefix > 32) {
      throw new Error(`Invalid CIDR range (IPv4 prefix must be 0-32): "${cidr}"`);
    }
    validateIPv4(ipPart);
  } else if (isIPv6(ipPart)) {
    if (prefix < 0 || prefix > 128) {
      throw new Error(`Invalid CIDR range (IPv6 prefix must be 0-128): "${cidr}"`);
    }
    validateIPv6(ipPart);
  } else {
    throw new Error(`Invalid CIDR range (invalid IP address): "${cidr}"`);
  }

  return true;
}

/**
 * Helper: Check if string is IPv4 format
 */
function isIPv4(str: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str);
}

/**
 * Helper: Check if string is IPv6 format
 */
function isIPv6(str: string): boolean {
  // Remove zone ID if present
  const ipWithoutZone = str.split('%')[0];
  // Simplified check - looks for colons and hex characters
  return /^[0-9a-f:]+$/i.test(ipWithoutZone) && ipWithoutZone.includes(':');
}
