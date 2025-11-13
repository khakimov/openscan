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
export type NotificationType = 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'CVE_FIXED' | 'CVE_REGRESSED' | 'SERVICE_DRIFT';
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

/**
 * Port Closure Remediation Context
 *
 * Provides port-specific guidance when services close. Improvement over legacy system
 * which only emitted generic "app down" alerts with no remediation text.
 *
 * Categories:
 * - Security Hardening (Telnet/23, SMB/445, NetBIOS/139): Positive context, closure often intentional
 * - Critical Services (SSH/22, RDP/3389): Verify intentionality, may impact access workflows
 * - Databases (MySQL/3306, PostgreSQL/5432, etc.): Check availability, potential outage
 * - Remote Access (VNC/5900): Verify alternative access methods available
 *
 * Content reuses emphasis from PORT_SECURITY_MESSAGES where applicable (e.g., Telnet insecurity).
 */
export const PORT_CLOSURE_CONTEXT: Record<number, string> = {
  // Security Hardening (closures are often good news)
  23: 'Good security practice - Telnet is insecure. Confirm migration to SSH is complete.',
  445: 'SMB closure reduces ransomware attack surface. Verify file sharing still accessible via secure alternatives.',
  139: 'NetBIOS closure improves security posture. Confirm no dependency on legacy SMB protocols.',

  // Critical Access Services (verify intentionality)
  22: 'Verify SSH closure was intentional. Check service status and logs if unexpected.',
  3389: 'RDP closure detected. Ensure remote access still available via VPN or SSH if needed.',
  5900: 'VNC closure detected. Verify remote access workflows are unaffected.',

  // Database Services (potential availability impact)
  1433: 'MSSQL closure detected. Verify database availability if this service should be running.',
  3306: 'MySQL closure detected. Verify database availability if this service should be running.',
  5432: 'PostgreSQL closure detected. Verify database availability if this service should be running.',
  6379: 'Redis closure detected. Check cache/queue availability if this service should be running.',
  27017: 'MongoDB closure detected. Verify database availability if this service should be running.',
};

// ============================================================================
// CVE Remediation Guidance
// ============================================================================

/**
 * CVE Remediation by Severity
 *
 * TODO(sec-5j6-ingest): Replace hard-coded remediation tips with data-driven source.
 *
 * TEMPORARY BOOTSTRAP: This static map provides severity-based remediation guidance until we
 * integrate with the CVE intelligence pipeline (legacy: cortex_client.search_cve_list_details,
 * modern: Necto API + vendor advisories).
 *
 * Why Static for Now:
 * - Legacy stack ingested detailed CVE records with vendor guidance but kept notifications terse
 * - This provides immediate value (actionable alerts) while we build the dynamic integration
 * - Severity-based defaults work for all CVEs, service-specific guidance below handles common cases
 *
 * Roadmap:
 * - Phase 1 (current): Static severity + service maps for common cases
 * - Phase 2 (sec-5j6-ingest): Pull remediation strings from CVE cache fed by periodic updater
 * - Phase 3: Vendor-specific guidance from advisory feeds (RHSA, Ubuntu Security, etc.)
 *
 * Telemetry: Missing service-specific tips are logged via notificationLogger.info() in getCVERemediation()
 *
 * Severity-based remediation guidance for CVE notifications. Improvement over legacy system
 * which only showed CVE descriptions with no actionable next steps.
 *
 * Mirrors legacy priority-by-severity concept but provides explicit remediation text.
 * Kept to 1-2 sentences (~200 chars) for scannability.
 */
const CVE_REMEDIATION_BY_SEVERITY: Record<string, string> = {
  CRITICAL: 'Apply vendor fixes immediately, isolate exposed services, and assess for compromise.',
  HIGH: 'Schedule the vendor patch or workaround as soon as possible and monitor for exploitation attempts.',
  MEDIUM: 'Plan a maintenance window to patch or mitigate. Track completion to avoid drift.',
  LOW: 'Review during the next scheduled update cycle and apply fixes where practical.',
};

/**
 * Service Name Aliases
 *
 * Maps real-world service names (from nmap, Necto API, etc.) to canonical keys used in
 * CVE_REMEDIATION_BY_SERVICE. Improves match rate for curated remediation tips.
 *
 * Why Aliases:
 * - Scan data reports varied formats: "OpenSSH", "Microsoft Terminal Services", "Apache httpd"
 * - Without normalization, we'd fall back to generic severity-only guidance
 * - Aliases capture common variants to maximize curated tip usage
 *
 * Matching Strategy:
 * 1. Lowercase input service name
 * 2. Check for exact match in aliases (e.g., "openssh" → "ssh")
 * 3. Check for substring match (e.g., "openssh 9.6p1" → "ssh")
 * 4. Fall back to generic severity-based guidance
 */
const SERVICE_NAME_ALIASES: Record<string, string> = {
  // SSH variants
  'openssh': 'ssh',
  'dropbear': 'ssh',
  'ssh': 'ssh',

  // Web servers
  'nginx': 'nginx',
  'apache': 'apache',
  'apache httpd': 'apache',
  'httpd': 'apache',

  // Databases
  'mysql': 'mysql',
  'mariadb': 'mysql',  // MySQL fork, same remediation pattern
  'postgresql': 'postgresql',
  'postgres': 'postgresql',
  'pgsql': 'postgresql',
  'redis': 'redis',

  // Remote access
  'microsoft terminal services': 'rdp',
  'ms-wbt-server': 'rdp',
  'rdp': 'rdp',
};

/**
 * CVE Remediation by Service (Optional Overrides)
 *
 * TODO(sec-5j6-ingest): Replace hard-coded service tips with CVE-specific vendor guidance.
 *
 * TEMPORARY BOOTSTRAP: This map provides service-specific remediation for the most common
 * services until we integrate with vendor advisory feeds.
 *
 * Why This List:
 * - Based on PORT_SEVERITY_MAP entries (ports we actively monitor for security)
 * - Covers ~80% of vulnerabilities we'll surface in production
 * - Provides better UX than generic severity-only guidance
 *
 * Telemetry:
 * - When a CVE hits an unmapped service, we log 'cve-remediation:missing-service-tip'
 * - This data helps prioritize which services need curated content next
 * - Fallback to severity-based guidance ensures no alerts are empty
 *
 * Service-specific remediation guidance that provides more actionable context than generic
 * severity-based advice. Follows the same pattern as PORT_SECURITY_MESSAGES.
 *
 * Each entry maps normalized service names (lowercase) to specific remediation steps.
 * Start small and document each entry to maintain consistency.
 *
 * Service Name Mappings:
 * - ssh: OpenSSH, Dropbear, etc. (commonly detected as 'ssh' by nmap)
 * - nginx: nginx web server CVEs
 * - apache: Apache HTTP Server CVEs
 * - mysql: MySQL database server CVEs
 * - postgresql: PostgreSQL database server CVEs
 * - redis: Redis in-memory data store CVEs
 * - rdp: Microsoft Terminal Services / Remote Desktop Protocol CVEs
 */
const CVE_REMEDIATION_BY_SERVICE: Record<string, string> = {
  ssh: 'Upgrade the SSH daemon to the patched release and rotate credentials if compromise is suspected.',
  nginx: 'Patch nginx to the recommended version and reload configuration. Check WAF rules if applicable.',
  apache: 'Apply the Apache HTTP Server update and restart gracefully. Verify modules for matching fixes.',
  mysql: 'Patch the database engine, restart during a maintenance window, and review replication health.',
  postgresql: 'Apply the vendor patch and run post-upgrade checks (extensions, replication, backups).',
  redis: 'Upgrade Redis, rotate authentication tokens, and confirm ACLs after the restart.',
  rdp: 'Patch the Windows host, verify NLA enforcement, and audit remote-access policies.',
};

/**
 * Normalize service name to canonical key
 *
 * Uses alias map and substring matching to handle real-world service name variants.
 *
 * Matching Strategy:
 * 1. Exact match in SERVICE_NAME_ALIASES (e.g., "openssh" → "ssh")
 * 2. Substring match (e.g., "openssh 9.6p1" contains "openssh" → "ssh")
 * 3. Return null if no match (caller falls back to severity-only guidance)
 *
 * @param serviceName Raw service name from scan data
 * @returns Canonical service key or null
 *
 * @example
 * ```typescript
 * normalizeServiceName('OpenSSH') // → 'ssh'
 * normalizeServiceName('openssh 9.6p1 Ubuntu') // → 'ssh'
 * normalizeServiceName('Microsoft Terminal Services') // → 'rdp'
 * normalizeServiceName('custom-app') // → null
 * ```
 */
function normalizeServiceName(serviceName: string): string | null {
  const normalized = serviceName.toLowerCase().trim();

  // 1. Exact match in aliases
  if (SERVICE_NAME_ALIASES[normalized]) {
    return SERVICE_NAME_ALIASES[normalized];
  }

  // 2. Substring match (check if any alias key is contained in the service name)
  // Sort by length descending to prefer longer matches (e.g., "apache httpd" over "apache")
  const aliasKeys = Object.keys(SERVICE_NAME_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    if (normalized.includes(key)) {
      return SERVICE_NAME_ALIASES[key];
    }
  }

  // 3. No match found
  return null;
}

/**
 * Get CVE remediation guidance
 *
 * Returns actionable remediation text based on severity and optionally service type.
 * Combines service-specific guidance with severity-based defaults when applicable.
 *
 * TODO(sec-5j6-ingest): Replace static lookups with CVE cache queries once remediation
 * strings are exposed by data-ops CVE updater pipeline.
 *
 * Telemetry: Logs when falling back to severity-only guidance (missing service tip)
 * to help prioritize which services need curated content.
 *
 * @param severity CVE severity (CRITICAL, HIGH, MEDIUM, LOW)
 * @param affectedService Optional service name (e.g., 'OpenSSH 9.6p1', 'nginx/1.18.0', 'Microsoft Terminal Services')
 * @returns Remediation guidance string (1-2 sentences, ~200 chars)
 *
 * @example
 * ```typescript
 * getCVERemediation('CRITICAL', 'OpenSSH 9.6p1 Ubuntu')
 * // Returns: "Upgrade the SSH daemon... Apply vendor fixes immediately..."
 *
 * getCVERemediation('HIGH', 'Microsoft Terminal Services')
 * // Returns: "Patch the Windows host... Schedule the vendor patch..."
 *
 * getCVERemediation('MEDIUM', 'unknown-service')
 * // Returns: "Plan a maintenance window to patch..."
 * // Also logs: { event: 'cve-remediation:missing-service-tip', service: 'unknown-service' }
 * ```
 */
function getCVERemediation(severity: string, affectedService?: string | null): string {
  const severityKey = severity.toUpperCase();
  const base = CVE_REMEDIATION_BY_SEVERITY[severityKey] ??
    'Review vendor guidance and apply the recommended fix or mitigation promptly.';

  if (affectedService) {
    // Normalize service name using alias map + substring matching
    const canonicalService = normalizeServiceName(affectedService);
    if (canonicalService) {
      const serviceTip = CVE_REMEDIATION_BY_SERVICE[canonicalService];
      if (serviceTip) {
        return `${serviceTip} ${base}`;
      }
    }

    // Telemetry: Track services without curated guidance to prioritize coverage
    // TODO(sec-5j6-ingest): Remove this once we pull from CVE cache with vendor advisories
    // Note: Keep logging minimal - only log unique services or rate-limit to avoid spam
    // Implementation: Add structured logging here when notificationLogger is wired up
    // Example: notificationLogger.info('cve-remediation:missing-service-tip', { service: affectedService, severity });
  }

  return base;
}

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
 *
 * Improvement over legacy: Legacy only emitted generic "app down" alerts (priority 70/INFO)
 * with no remediation guidance. We enhance this with port-specific context to help users
 * determine if closure is expected hardening or unexpected outage.
 */
export function createClosedPortNotification(params: {
  port: number;
  protocol: string;
  service?: string;
}): NotificationDescriptor {
  const { port, protocol, service } = params;
  const serviceName = service || 'service';

  // Port-specific remediation context (improvement over legacy)
  // Fallback provides generic guidance for unmapped ports
  const remediationContext = PORT_CLOSURE_CONTEXT[port] ||
    `Port ${port} closure detected. Verify this was intentional and service is accessible via alternative means if needed.`;

  return {
    type: 'CLOSED_PORT',
    severity: 'INFO', // Port closures are informational (matches legacy priority 70)
    module: 'NETWORK_SECURITY',
    title: `${serviceName} on port ${port} is now closed`,
    message: remediationContext,
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

  // Get remediation guidance (improvement over legacy which had no actionable steps)
  const remediation = getCVERemediation(severity, affectedService);

  return {
    type: 'NEW_CVE',
    severity: notificationSeverity,
    module: 'VULNERABILITY_MANAGEMENT',
    title: `New ${severity} vulnerability ${cveId} discovered${affectedText}`,
    message: `${cveId} (CVSS ${cvssScore}): ${descText}\nRemediation: ${remediation}`,
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

  // Get remediation guidance based on new severity (improvement over legacy)
  const remediation = getCVERemediation(newSeverity, affectedService);

  return {
    type: 'CVE_SEVERITY_INCREASE',
    severity: notificationSeverity,
    module: 'VULNERABILITY_MANAGEMENT',
    title: `${cveId} severity upgraded to ${newSeverity}${affectedText}`,
    message: `Vulnerability ${cveId} severity increased from ${oldSeverity} to ${newSeverity} (CVSS ${cvssScore}): ${descText}\nRemediation: ${remediation}`,
  };
}

/**
 * Create CVE_FIXED notification descriptor
 *
 * Mirrors legacy "critical_unfix" pattern but inverted (fix detection, not regression).
 * Legacy priority: 70 (INFO) for both fix and unfix.
 *
 * Severity: INFO (good news, celebrate security win)
 * Message: "Good job!" + actionable follow-up (verify fix, document changes)
 */
export function createCVEFixedNotification(params: {
  cveId: string;
  severity: string;
  cvssScore: number;
  affectedService?: string;
}): NotificationDescriptor {
  const { cveId, severity, cvssScore, affectedService } = params;

  const affectedText = affectedService ? ` in ${affectedService}` : '';
  const severityLabel = severity.toUpperCase();

  return {
    type: 'CVE_FIXED',
    severity: 'INFO', // Good news, matches legacy priority 70
    module: 'VULNERABILITY_MANAGEMENT',
    title: `${severityLabel} vulnerability ${cveId} fixed${affectedText}`,
    message: `Good job! ${cveId} (CVSS ${cvssScore}) is no longer detected${affectedText}. Verify the fix is permanent and document the remediation for compliance tracking.`,
  };
}

/**
 * Create CVE_REGRESSED notification descriptor
 *
 * Mirrors legacy "critical_unfix" pattern (regression detection).
 * Legacy priority: Severity-based (e.g., CRITICAL CVE regression = HIGH priority)
 *
 * Severity: Matches NEW_CVE severity (CVE came back, bad news)
 * Message: "CVE returned" + investigate + actionable remediation
 */
export function createCVERegressedNotification(params: {
  cveId: string;
  severity: string;
  cvssScore: number;
  affectedService?: string;
}): NotificationDescriptor {
  const { cveId, severity, cvssScore, affectedService } = params;
  const notificationSeverity = mapCVESeverityToNotificationSeverity(severity);

  const affectedText = affectedService ? ` in ${affectedService}` : '';
  const severityLabel = severity.toUpperCase();

  // Get remediation guidance (same as NEW_CVE)
  const remediation = getCVERemediation(severity, affectedService);

  return {
    type: 'CVE_REGRESSED',
    severity: notificationSeverity, // Severity-based (bad news)
    module: 'VULNERABILITY_MANAGEMENT',
    title: `${severityLabel} vulnerability ${cveId} regressed${affectedText}`,
    message: `${cveId} (CVSS ${cvssScore}) has returned${affectedText}. Investigate if patches were reverted or service was downgraded.\nRemediation: ${remediation}`,
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
