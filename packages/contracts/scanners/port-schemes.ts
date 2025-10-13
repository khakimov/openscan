/**
 * Port-to-service scheme mappings
 *
 * Used to normalize port scan results by providing sensible defaults
 * when scanners don't detect service names, while preserving actual
 * scanner detections when available.
 */

export interface PortSchemeMapping {
  port: number;
  defaultScheme: string;
}

/**
 * Common port-to-service mappings
 * Organized by category for maintainability
 *
 * Used as fallback only when scanner doesn't provide meaningful service names
 */
export const PORT_SCHEMES: ReadonlyMap<number, PortSchemeMapping> = new Map([
  // Web Services
  [80, { port: 80, defaultScheme: 'http' }],
  [443, { port: 443, defaultScheme: 'https' }],
  [8080, { port: 8080, defaultScheme: 'http' }],
  [8443, { port: 8443, defaultScheme: 'https' }],
  [3000, { port: 3000, defaultScheme: 'http' }],

  // Email Services
  [25, { port: 25, defaultScheme: 'smtp' }],
  [465, { port: 465, defaultScheme: 'smtps' }],
  [587, { port: 587, defaultScheme: 'smtp' }],
  [143, { port: 143, defaultScheme: 'imap' }],
  [993, { port: 993, defaultScheme: 'imaps' }],
  [110, { port: 110, defaultScheme: 'pop3' }],
  [995, { port: 995, defaultScheme: 'pop3s' }],

  // Databases
  [3306, { port: 3306, defaultScheme: 'mysql' }],
  [5432, { port: 5432, defaultScheme: 'postgresql' }],
  [1433, { port: 1433, defaultScheme: 'mssql' }],
  [27017, { port: 27017, defaultScheme: 'mongodb' }],
  [6379, { port: 6379, defaultScheme: 'redis' }],

  // Monitoring/Analytics
  [9200, { port: 9200, defaultScheme: 'elasticsearch' }],
  [5601, { port: 5601, defaultScheme: 'kibana' }],
  [9090, { port: 9090, defaultScheme: 'prometheus' }],

  // Other Services
  [22, { port: 22, defaultScheme: 'ssh' }],
  [21, { port: 21, defaultScheme: 'ftp' }],
  [3389, { port: 3389, defaultScheme: 'rdp' }],
]);

/**
 * Known service name corrections
 * Maps incorrect scanner detections to correct scheme names
 * Format: "port:serviceName" -> corrected scheme
 */
const SERVICE_CORRECTIONS = new Map([
  // Port 443 often mislabeled as http
  ['443:http', 'https'],
  // Port 993 sometimes just called imap
  ['993:imap', 'imaps'],
  // Port 995 sometimes just called pop3
  ['995:pop3', 'pop3s'],
]);

/**
 * Normalize service/protocol names using precedence:
 * 1. Fix known misclassifications (443 labeled as 'http' → 'https')
 * 2. Use scanner-detected service name if meaningful
 * 3. Fallback to port-based default if service is generic/missing
 * 4. Use protocol as last resort
 *
 * @param port - Port number
 * @param protocol - Transport protocol (tcp/udp)
 * @param serviceName - Service name detected by scanner (optional)
 * @returns Normalized service scheme name
 *
 * @example
 * // Known misclassification
 * normalizeServiceScheme(443, 'tcp', 'http') // => 'https'
 *
 * // Meaningful scanner detection preserved
 * normalizeServiceScheme(443, 'tcp', 'ssh') // => 'ssh'
 *
 * // Port-based fallback
 * normalizeServiceScheme(3306, 'tcp') // => 'mysql'
 *
 * // Last resort - protocol
 * normalizeServiceScheme(54321, 'tcp') // => 'tcp'
 */
export function normalizeServiceScheme(
  port: number,
  protocol: string,
  serviceName?: string
): string {
  // Step 1: Check for known misclassifications
  if (serviceName) {
    const correctionKey = `${port}:${serviceName.toLowerCase()}`;
    const correction = SERVICE_CORRECTIONS.get(correctionKey);
    if (correction) {
      return correction;
    }
  }

  // Step 2: Use scanner-detected service if meaningful
  // (not generic protocol names like 'tcp', 'unknown', etc.)
  if (serviceName && !isGenericServiceName(serviceName)) {
    return serviceName;
  }

  // Step 3: Fallback to port-based default
  const portMapping = PORT_SCHEMES.get(port);
  if (portMapping) {
    return portMapping.defaultScheme;
  }

  // Step 4: Last resort - use transport protocol (not generic service name)
  return protocol;
}

/**
 * Check if a service name is generic/meaningless
 * Generic names don't provide useful information and should trigger port-based fallback
 *
 * @param serviceName - Service name to check
 * @returns true if the service name is generic (tcp, udp, unknown, tcpwrapped, empty)
 *
 * @example
 * isGenericServiceName('tcp')         // true
 * isGenericServiceName('unknown')     // true
 * isGenericServiceName('nginx')       // false
 */
export function isGenericServiceName(serviceName: string): boolean {
  const generic = [
    'tcp',
    'udp',
    'unknown',
    'tcpwrapped',
    '',
  ];
  return generic.includes(serviceName.toLowerCase());
}

/**
 * Get all known ports for documentation/UI purposes
 * Returns ports sorted numerically
 */
export function getKnownPorts(): number[] {
  return Array.from(PORT_SCHEMES.keys()).sort((a, b) => a - b);
}

/**
 * Get default scheme for a specific port (for UI/documentation)
 * Returns undefined if port is not in the registry
 */
export function getDefaultSchemeForPort(port: number): string | undefined {
  return PORT_SCHEMES.get(port)?.defaultScheme;
}
