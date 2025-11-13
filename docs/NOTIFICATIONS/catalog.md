# Notification Catalog

### Overview

**File**: `packages/data-ops/src/notifications/catalog.ts`

Centralized registry of all notification types, messages, and metadata. Inspired by legacy footprint system's `messages.py` pattern.

**Benefits**:
- Consistent tone and severity across all notifications
- Easy to add new notification types
- Simplifies i18n if needed in the future
- Single source of truth for notification copy
- Easier to unit test notification logic

### Port Security Messages

```typescript
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
```

### Notification Builder Functions

```typescript
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
    title: `${cveId} severity upgraded to ${newSeverity}${affectedText}`,
    message: `Vulnerability ${cveId} severity increased from ${oldSeverity} to ${newSeverity} (CVSS ${cvssScore}): ${descText}`,
  };
}
```

### Helper Functions

```typescript
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
```

---
