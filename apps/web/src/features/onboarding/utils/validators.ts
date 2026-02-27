/**
 * Domain validation utilities
 * Security-focused validators for user input
 */

/**
 * RFC-compliant domain name regex
 * Only allows valid domain characters (a-z, 0-9, hyphens)
 */
export const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Blocked internal and localhost domains
 */
const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'local',
  'internal',
  '.local',
  '.internal',
  '.localdomain',
  '.localhost'
];

/**
 * Dangerous patterns for command injection prevention
 */
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>\\]/,  // Shell metacharacters
  /\.\./,                 // Directory traversal
  /^-/,                   // Command flags
];

/**
 * Maximum allowed domain length per RFC 1035
 */
const MAX_DOMAIN_LENGTH = 253;

export type ValidationError = string;

/**
 * Validates a domain name for security and format compliance
 *
 * @param domain - The domain to validate (will be trimmed and lowercased)
 * @returns ValidationError message or undefined if valid
 *
 * @example
 * validateDomain("example.com") // undefined (valid)
 * validateDomain("localhost") // "Cannot scan internal or localhost domains"
 * validateDomain("example.com; rm -rf") // "Invalid characters detected in domain name"
 */
export function validateDomain(domain: string): ValidationError | undefined {
  const trimmedDomain = domain.trim().toLowerCase();

  // Empty check
  if (!trimmedDomain) {
    return "Please enter a domain name";
  }

  // RFC format validation
  if (!DOMAIN_REGEX.test(trimmedDomain)) {
    return "Please enter a valid domain name (e.g., example.com)";
  }

  // Internal/localhost domain check
  if (BLOCKED_DOMAINS.some(blocked =>
    trimmedDomain === blocked ||
    trimmedDomain.endsWith(blocked) ||
    trimmedDomain.includes('localhost') ||
    trimmedDomain.includes('127.0.0.1')
  )) {
    return "Cannot scan internal or localhost domains";
  }

  // Command injection prevention
  if (DANGEROUS_PATTERNS.some(pattern => pattern.test(trimmedDomain))) {
    return "Invalid characters detected in domain name";
  }

  // Length validation
  if (trimmedDomain.length > MAX_DOMAIN_LENGTH) {
    return "Domain name is too long";
  }

  return undefined;
}

/**
 * Normalizes a domain by trimming and lowercasing
 *
 * @param domain - The domain to normalize
 * @returns Normalized domain string
 */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}
