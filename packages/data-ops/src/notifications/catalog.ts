/**
 * Notification Catalog
 *
 * Centralized registry of all notification types, messages, and metadata.
 * Inspired by legacy footprint system's messages.py pattern.
 *
 * Benefits:
 * - Consistent tone and severity across all notifications
 * - Easy to add new notification types
 * - Simplifies i18n if needed in the future
 * - Single source of truth for notification copy
 * - Easier to unit test notification logic
 */

// ============================================================================
// Types
// ============================================================================

export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type NotificationType = 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'SERVICE_DRIFT';
export type NotificationModule = 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT' | 'GENERAL';

interface NotificationDescriptor {
  type: NotificationType;
  severity: NotificationSeverity;
  module: NotificationModule;
  title: string;
  message?: string;
}

// ============================================================================
// Port Discovery Messages
// ============================================================================

export const PORT_SECURITY_MESSAGES: Record<number, string> = {
  22: 'SSH service detected. Ensure strong authentication and disable root login.',
  23: 'Telnet service detected. CRITICAL: Unencrypted protocol, migrate to SSH immediately.',
  445: 'SMB service detected. Patch regularly (EternalBlue, SMBGhost vulnerabilities).',
  139: 'NetBIOS service detected. Legacy SMB protocol, consider disabling if not needed.',
  1433: 'MSSQL service exposed. Restrict access and use strong authentication.',
  3306: 'MySQL service exposed. Restrict access and disable remote root.',
  3389: 'RDP service exposed. High risk - consider VPN-only access and enable NLA.',
  5432: 'PostgreSQL service exposed. Review pg_hba.conf and use SSL.',
  5900: 'VNC service detected. Use strong passwords or VPN-only access.',
  6379: 'Redis service exposed. Enable authentication and bind to localhost.',
  27017: 'MongoDB service exposed. Enable authentication and use IP whitelisting.',
};

export const PORT_SEVERITY_MAP: Record<number, NotificationSeverity> = {
  22: 'MEDIUM',    // SSH - common target
  23: 'HIGH',      // Telnet - insecure
  3389: 'HIGH',    // RDP - common attack vector
  445: 'HIGH',     // SMB - ransomware vector
  139: 'HIGH',     // NetBIOS - legacy SMB
  1433: 'MEDIUM',  // MSSQL
  3306: 'MEDIUM',  // MySQL
  5432: 'MEDIUM',  // PostgreSQL
  6379: 'MEDIUM',  // Redis
  27017: 'MEDIUM', // MongoDB
  5900: 'HIGH',    // VNC - remote access
};

// ============================================================================
// Notification Builders
// ============================================================================

/**
 * Create NEW_PORT notification descriptor
 */
export function createNewPortNotification(params: {
  port: number;
  protocol: string;
  service?: string;
  version?: string;
}): NotificationDescriptor {
  const { port, protocol, service, version } = params;
  const serviceName = service || 'service';
  const severity = PORT_SEVERITY_MAP[port] || 'LOW';
  const securityMessage = PORT_SECURITY_MESSAGES[port] ||
    `New service detected on port ${port}. Review security configuration.`;

  return {
    type: 'NEW_PORT',
    severity,
    module: 'NETWORK_SECURITY',
    title: `New ${serviceName} on port ${port} discovered`,
    message: securityMessage,
  };
}

/**
 * Create CLOSED_PORT notification descriptor
 */
export function createClosedPortNotification(params: {
  port: number;
  protocol: string;
  service?: string;
}): NotificationDescriptor {
  const { port, protocol, service } = params;
  const serviceName = service || 'service';

  return {
    type: 'CLOSED_PORT',
    severity: 'INFO', // Port closures are informational (good news)
    module: 'NETWORK_SECURITY',
    title: `${serviceName} on port ${port} is now closed`,
    message: `Port ${port}/${protocol} (${serviceName}) is no longer accessible`,
  };
}

/**
 * Create NEW_CVE notification descriptor
 */
export function createNewCVENotification(params: {
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
}): NotificationDescriptor {
  const { cveId, severity, cvssScore, description, affectedService } = params;
  const notificationSeverity = mapCVESeverityToNotificationSeverity(severity);

  const affectedText = affectedService ? ` affecting ${affectedService}` : '';
  const descText = description || 'No description available';

  return {
    type: 'NEW_CVE',
    severity: notificationSeverity,
    module: 'VULNERABILITY_MANAGEMENT',
    title: `New ${severity} vulnerability ${cveId} discovered${affectedText}`,
    message: `${cveId} (CVSS ${cvssScore}): ${descText}`,
  };
}

/**
 * Create CVE_SEVERITY_INCREASE notification descriptor
 */
export function createCVESeverityIncreaseNotification(params: {
  cveId: string;
  oldSeverity: string;
  newSeverity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
}): NotificationDescriptor {
  const { cveId, oldSeverity, newSeverity, cvssScore, description, affectedService } = params;
  const notificationSeverity = mapCVESeverityToNotificationSeverity(newSeverity);

  const affectedText = affectedService ? ` affecting ${affectedService}` : '';
  const descText = description || 'No description available';

  return {
    type: 'CVE_SEVERITY_INCREASE',
    severity: notificationSeverity,
    module: 'VULNERABILITY_MANAGEMENT',
    title: `${cveId} severity upgraded to ${newSeverity}${affectedText}`,
    message: `Vulnerability ${cveId} severity increased from ${oldSeverity} to ${newSeverity} (CVSS ${cvssScore}): ${descText}`,
  };
}

/**
 * Create SERVICE_DRIFT notification descriptor
 *
 * Mirrors legacy Daemon.compare_parameters behavior (daemon.py:57-87)
 * - Product changes: MEDIUM severity (suspicious, like APP_PRODUCT priority 70)
 * - Version/name changes: INFO severity (informational, like APP_VERSION priority 70)
 *
 * Legacy message templates:
 * - Product: "Application product %s detected on host %s is currently listening on port %s,
 *   which was previously in use by application %s"
 * - Version: "Application %s with actual version %s changed from %s for product detected on
 *   host %s and running on port %s"
 */
export function createServiceDriftNotification(params: {
  port: number;
  protocol: string;
  oldService?: {
    name?: string;
    product?: string | null;
    version?: string | null;
  } | null;
  newService?: {
    name?: string;
    product?: string | null;
    version?: string | null;
  } | null;
}): NotificationDescriptor {
  const { port, protocol, oldService, newService } = params;

  // Normalize nulls for comparison
  const oldProduct = oldService?.product ?? undefined;
  const newProduct = newService?.product ?? undefined;
  const oldVersion = oldService?.version ?? undefined;
  const newVersion = newService?.version ?? undefined;
  const oldName = oldService?.name ?? undefined;
  const newName = newService?.name ?? undefined;

  // Determine drift type and severity
  const productChanged = oldProduct !== newProduct;
  const versionChanged = oldVersion !== newVersion;
  const nameChanged = oldName !== newName;

  // Product change = suspicious (MEDIUM severity, mirrors legacy priority 70)
  // Version/name change only = informational (INFO severity)
  const severity: NotificationSeverity = productChanged ? 'MEDIUM' : 'INFO';

  // Build human-readable title (inspired by legacy messages)
  let title: string;
  let message: string;

  if (productChanged) {
    // Product change (suspicious - could be attack or misconfiguration)
    const oldLabel = oldProduct || 'unknown';
    const newLabel = newProduct || 'unknown';
    title = `Service on port ${port}/${protocol} switched from ${oldLabel} → ${newLabel}`;
    message = `Port ${port}/${protocol} was previously running ${oldLabel}${oldVersion ? ` ${oldVersion}` : ''}, now running ${newLabel}${newVersion ? ` ${newVersion}` : ''}`;
  } else if (versionChanged) {
    // Version upgrade/downgrade (informational)
    const productLabel = newProduct || newName || 'service';
    title = `${productLabel} on port ${port}/${protocol} version changed: ${oldVersion || 'unknown'} → ${newVersion || 'unknown'}`;
    message = `${productLabel} version updated from ${oldVersion || 'unknown'} to ${newVersion || 'unknown'} on port ${port}/${protocol}`;
  } else if (nameChanged) {
    // Service name changed (rare, usually service detection improved)
    title = `Service name on port ${port}/${protocol} changed: ${oldName || 'unknown'} → ${newName || 'unknown'}`;
    message = `Service detection updated on port ${port}/${protocol}`;
  } else {
    // Fallback (shouldn't happen if hasServiceDrift is correct)
    title = `Service metadata changed on port ${port}/${protocol}`;
    message = `Service configuration on port ${port}/${protocol} was modified`;
  }

  return {
    type: 'SERVICE_DRIFT',
    severity,
    module: 'NETWORK_SECURITY',
    title,
    message,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map CVE severity (from Necto API) to notification severity
 */
export function mapCVESeverityToNotificationSeverity(
  cveSeverity: string
): NotificationSeverity {
  const upper = cveSeverity.toUpperCase();
  if (upper === 'CRITICAL') return 'CRITICAL';
  if (upper === 'HIGH') return 'HIGH';
  if (upper === 'MEDIUM') return 'MEDIUM';
  if (upper === 'LOW') return 'LOW';
  return 'INFO';
}

/**
 * Get severity order for comparison (higher number = more severe)
 */
export function getSeverityOrder(severity: string): number {
  const order: Record<string, number> = {
    INFO: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };
  return order[severity.toUpperCase()] || 0;
}
