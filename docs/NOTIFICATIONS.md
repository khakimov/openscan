# Notification System - Complete Architecture & Implementation

**Status**: ✅ Implemented (MVP Complete)
**Last Updated**: 2025-11-09
**Owner**: Security Monitoring Team

---

## Overview

The notification system alerts users when security scans detect meaningful changes:
- **New open ports** discovered
- **Previously open ports** closed
- **New vulnerabilities (CVEs)** detected
- **CVE severity upgrades**

This system follows a **template-driven, database-first architecture** inspired by battle-tested patterns from the legacy footprint platform, with modern improvements for atomic deduplication and centralized messaging.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Implementation Status](#implementation-status)
3. [Data Model](#data-model)
4. [Change Detection](#change-detection)
5. [Notification Catalog](#notification-catalog)
6. [Deduplication Strategy](#deduplication-strategy)
7. [Design Decisions](#design-decisions)
8. [Bug Fixes & Improvements](#bug-fixes--improvements)
9. [Testing](#testing)
10. [API Reference](#api-reference)
11. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Scheduled/Manual Scan                                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Restate Worker: DeviceScanner.executeScan()                    │
│ - Runs port scan (masscan → rustscan → nmap)                   │
│ - Enriches with CVE data (Necto API)                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼ Postback
┌─────────────────────────────────────────────────────────────────┐
│ /api/internal/scan-results                                      │
│ - Universal postback router                                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ PortScanHandler.handleSuccess()                                │
│ 1. Update scan_runs.status = 'SUCCEEDED'                       │
│ 2. Persist result_summary (ports + CVEs)                       │
│ 3. ✅ Change Detection                                         │
│    - Load fresh scan data (CRITICAL FIX)                       │
│    - Load previous successful scan for device                  │
│    - Diff current vs previous                                  │
│    - Filter meaningful changes                                 │
│ 4. ✅ Create Notifications with Catalog                        │
│    - Use notification catalog for messages                     │
│    - Atomic check-and-insert with transactions (CRITICAL FIX)  │
│    - Database-level unique constraint (belt-and-suspenders)    │
│    - Persist to notifications table                            │
│ 5. Trigger Delivery                                            │
│    - In-app (stored in DB, shown in UI)                        │
│    - Email (for CRITICAL/HIGH severity) [FUTURE]               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Sees Notification                                          │
│ - Bell icon with badge count                                   │
│ - Notification sheet/dropdown                                  │
│ - Email (future feature)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **PortScanHandler** | Orchestrates change detection after scan persist | `apps/user-application/src/server/postback/handlers/port-scan.ts:491` |
| **ChangeDetector** | Diffs scans, emits normalized change events | `apps/user-application/src/server/notifications/change-detector.ts` |
| **NotificationCatalog** | Centralized message templates and severity maps | `packages/data-ops/src/notifications/catalog.ts` |
| **NotificationQueries** | CRUD operations with atomic deduplication | `packages/data-ops/src/queries/notifications.ts` |
| **UI Components** | Bell icon, dropdown, notification page | `apps/user-application/src/components/notifications/` |
| **Server Functions** | TanStack Start API layer | `apps/user-application/src/server/notifications.ts` |

---

## Implementation Status

### ✅ Completed Features

#### Core Infrastructure
- [x] Database schema with `now()` and `updatedAt()` helpers
- [x] Unique index on `(organizationId, fingerprint)` for atomic deduplication
- [x] Suppress windows: 6h for ports, 24h for CVEs
- [x] Data-ops CRUD helpers (create, list, markRead, getUnreadCount)
- [x] Drizzle migration workflow (`pnpm drizzle:generate`, `pnpm drizzle:migrate`)

#### Change Detection
- [x] Port diffing logic (NEW_PORT, CLOSED_PORT)
- [x] CVE diffing logic (NEW_CVE, CVE_SEVERITY_INCREASE)
- [x] Baseline selection (last successful scan for device)
- [x] **Bug Fix**: Use `cveId` field (not `id`) for CVE map keys
- [x] **Bug Fix**: Join on `runId` (not `scanRunId`) in baseline query
- [x] **Bug Fix**: Extract service names from objects (not `[object Object]`)
- [x] **Critical Fix**: Pass fresh scan data with updated `resultSummary` to change detector

#### Notification Catalog
- [x] Centralized message templates (`PORT_SECURITY_MESSAGES`)
- [x] Port severity mapping (`PORT_SEVERITY_MAP`)
- [x] Builder functions: `createNewPortNotification()`, `createClosedPortNotification()`, `createNewCVENotification()`, `createCVESeverityIncreaseNotification()`
- [x] Helper functions: `mapCVESeverityToNotificationSeverity()`, `getSeverityOrder()`

#### Deduplication & Race Conditions
- [x] **Critical Fix**: Atomic check-and-insert with database transactions
- [x] **Belt-and-Suspenders**: Unique constraint on `(organizationId, fingerprint)`
- [x] Suppress window enforcement (skips duplicate notifications)

#### In-App Notifications
- [x] Server functions (getNotifications, markAsRead, markAllAsRead, getUnreadCount)
- [x] TanStack Query hooks with 30-second polling
- [x] Bell icon UI with unread badge
- [x] Notification sheet/dropdown
- [x] **Design Decision**: Org-wide read state (not per-user) for security events

#### Integration
- [x] Port scan postback handler integration
- [x] Change detection invoked after result persist
- [x] **Critical Fix**: Stale scan data bug resolved (pass fresh `resultSummary`)

### 📋 Pending Features (Future Phases)

- [ ] Email delivery for CRITICAL/HIGH notifications
- [ ] Refactor change detector to use catalog functions (currently uses inline messages)
- [ ] Partial unique index with `WHERE suppressUntil > CURRENT_TIMESTAMP` (currently full index)
- [ ] Message hashing for secondary deduplication (fingerprints are structured strings)
- [ ] Module taxonomy (currently only type + severity)
- [ ] Batch cleanup jobs for expired notifications
- [ ] Per-device rate limiting (10/day cap)
- [ ] Webhook integrations (Slack, Discord, PagerDuty)
- [ ] User preference system

---

## Data Model

### Schema: `notifications` Table

**File**: `packages/data-ops/src/schema/notifications.ts`

```typescript
export const notifications = sqliteTable('notifications', {
  // Identity
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => auth_user.id, { onDelete: 'cascade' }),

  // Related entities
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  scanRunId: text('scan_run_id').references(() => scanRuns.id, { onDelete: 'cascade' }),

  // Notification metadata
  type: text('type').notNull(), // 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'CVE_FIXED' | 'CVE_REGRESSED' | 'SERVICE_DRIFT'
  severity: text('severity').notNull(), // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

  title: text('title').notNull(),
  message: text('message'),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),

  // Deduplication: fingerprint + time window
  fingerprint: text('fingerprint').notNull(), // e.g., "new_port:dev_123:22:tcp"
  suppressUntil: integer('suppress_until', { mode: 'timestamp_ms' }).notNull(),

  // User interaction tracking
  readAt: integer('read_at', { mode: 'timestamp_ms' }),

  // Email delivery tracking
  emailSent: integer('email_sent', { mode: 'boolean' }).notNull().default(false),
  emailSentAt: integer('email_sent_at', { mode: 'timestamp_ms' }),

  // Timestamps
  createdAt: now(),
  updatedAt: updatedAt(),
}, (t) => ({
  // Query performance indexes
  orgIdx: index('notifications_org_idx').on(t.organizationId),
  deviceIdx: index('notifications_device_idx').on(t.deviceId),
  userIdx: index('notifications_user_idx').on(t.userId),

  // Deduplication query index
  dedupIdx: index('notifications_dedup_idx').on(t.organizationId, t.fingerprint, t.suppressUntil),

  // ✅ UNIQUE CONSTRAINT - Database-level deduplication enforcement
  // Belt-and-suspenders with transaction-based check-and-insert
  // Full index on (organizationId, fingerprint) - simple and reliable
  // Future: Could switch to partial index (WHERE suppressUntil > CURRENT_TIMESTAMP)
  // via custom SQL to allow fingerprint reuse after suppress window expires
  fingerprintUniqueIdx: uniqueIndex('notifications_fingerprint_unique_idx')
    .on(t.organizationId, t.fingerprint),

  // Unread count query
  unreadIdx: index('notifications_unread_idx').on(t.organizationId, t.readAt),

  // Email delivery query
  emailPendingIdx: index('notifications_email_pending_idx').on(t.emailSent, t.severity),

  // Recent notifications query
  createdAtIdx: index('notifications_created_at_idx').on(t.createdAt),
}));
```

### Migration

**Generated with**: `pnpm drizzle:generate`
**Applied with**: `pnpm drizzle:migrate` (or `pnpm wrangler d1 execute ...` for local)

**File**: `packages/data-ops/migrations/0006_flippant_luckman.sql`

```sql
CREATE UNIQUE INDEX `notifications_fingerprint_unique_idx`
ON `notifications` (`organization_id`, `fingerprint`);
```

### Notification Types & Severity

| Type | Description | Default Severity | Fingerprint Format |
|------|-------------|-----------------|-------------------|
| `NEW_PORT` | Previously closed/unknown port is now open | Varies by port | `new_port:{deviceId}:{protocol}:{port}:{product}:{version}:{name}` |
| `CLOSED_PORT` | Previously open port is now closed/filtered | `INFO` | `closed_port:{deviceId}:{protocol}:{port}:{product}:{version}:{name}` |
| `NEW_CVE` | New vulnerability detected (wasn't in previous scan) | CVE severity | `new_cve:{deviceId}:{cve_id}` |
| `CVE_SEVERITY_INCREASE` | Existing CVE severity upgraded | New severity | `cve_upgrade:{deviceId}:{cve_id}` |

### Port Severity Mapping

**File**: `packages/data-ops/src/notifications/catalog.ts`

```typescript
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
```

**Default**: `LOW` for unknown ports

---

## Change Detection

### Core Algorithm

**File**: `apps/user-application/src/server/notifications/change-detector.ts`

```typescript
/**
 * Detect changes between current and previous scan
 *
 * CRITICAL FIX: Must receive scan with fresh resultSummary
 * (not stale database object from pre-update query)
 */
export async function detectScanChanges(params: {
  deviceId: string;
  currentScan: typeof scanRuns.$inferSelect;
  organizationId: string;
}): Promise<Array<CreateNotificationInput>> {
  const { deviceId, currentScan, organizationId } = params;

  // Early exit: no results to compare
  if (!currentScan.resultSummary) {
    logger.info('Skipping change detection: no resultSummary');
    return [];
  }

  // Load baseline (previous successful scan)
  const baseline = await getLastSuccessfulScanForDevice({
    deviceId,
    organizationId,
    excludeScanId: currentScan.id,
  });

  // First scan for device - no changes to detect
  if (!baseline || !baseline.resultSummary) {
    logger.info('Skipping change detection: no baseline scan');
    return [];
  }

  const changes: Array<CreateNotificationInput> = [];

  // Diff ports
  changes.push(...diffPorts(
    currentScan.resultSummary,
    baseline.resultSummary,
    deviceId,
    organizationId,
    currentScan.id
  ));

  // Diff CVEs
  changes.push(...diffCVEs(
    currentScan.resultSummary,
    baseline.resultSummary,
    deviceId,
    organizationId,
    currentScan.id
  ));

  return changes;
}
```

### Port Diffing Logic

```typescript
/**
 * Compare port states between scans
 *
 * BUG FIX: Extract service names from objects
 * (service can be string OR object with name/product fields)
 */
function diffPorts(
  current: any,
  previous: any,
  deviceId: string,
  organizationId: string,
  scanRunId: string
): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  // Build port maps: "port/protocol" → port object
  const prevPortMap = new Map<string, any>();
  for (const port of previous.ports || []) {
    const key = `${port.port}/${port.protocol}`;
    prevPortMap.set(key, port);
  }

  const currPortMap = new Map<string, any>();
  for (const port of current.ports || []) {
    const key = `${port.port}/${port.protocol}`;
    currPortMap.set(key, port);
  }

  // Detect NEW open ports
  for (const [key, port] of currPortMap) {
    const wasOpen = prevPortMap.has(key) && prevPortMap.get(key).state === 'open';
    const isNowOpen = port.state === 'open';

    if (isNowOpen && !wasOpen) {
      // ✅ FIX: Extract service name from object
      const serviceName = port.service?.name || port.service?.product || port.service || 'service';
      const product = port.service?.product || serviceName;
      const version = port.service?.version || 'unknown';
      const name = serviceName;

      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        type: 'NEW_PORT',
        severity: determinePortSeverity(port.port),
        title: `New ${serviceName} on port ${port.port} discovered`,
        message: getPortSecurityMessage(port),
        data: {
          port: port.port,
          protocol: port.protocol,
          service: serviceName,
          state: port.state,
          version: port.version,
        },
        fingerprint: `new_port:${deviceId}:${port.protocol}:${port.port}:${product}:${version}:${name}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      });
    }
  }

  // Detect CLOSED ports (previously open, now closed/filtered)
  for (const [key, prevPort] of prevPortMap) {
    const wasOpen = prevPort.state === 'open';
    const currPort = currPortMap.get(key);
    const isNowOpen = currPort && currPort.state === 'open';

    if (wasOpen && !isNowOpen) {
      const serviceName = prevPort.service?.name || prevPort.service?.product || prevPort.service || 'unknown';
      const product = prevPort.service?.product || serviceName;
      const version = prevPort.service?.version || 'unknown';
      const name = serviceName;

      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        type: 'CLOSED_PORT',
        severity: 'INFO', // Port closing is informational (good news)
        title: `${serviceName} on port ${prevPort.port} is now closed`,
        message: `Port ${prevPort.port}/${prevPort.protocol} (${serviceName}) is no longer accessible`,
        data: {
          port: prevPort.port,
          protocol: prevPort.protocol,
          service: serviceName,
          previousState: prevPort.state,
        },
        fingerprint: `closed_port:${deviceId}:${prevPort.protocol}:${prevPort.port}:${product}:${version}:${name}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      });
    }
  }

  return changes;
}
```

### CVE Diffing Logic

```typescript
/**
 * Compare CVE enrichment between scans
 *
 * BUG FIX: Use cve.cveId (not cve.id) for map keys
 * (matches safeParseCVEEnrichment schema)
 */
function diffCVEs(
  current: any,
  previous: any,
  deviceId: string,
  organizationId: string,
  scanRunId: string
): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  const currentCVEs = extractCVEsFromEnrichment(current.cveEnrichment);
  const previousCVEs = extractCVEsFromEnrichment(previous.cveEnrichment);

  // ✅ FIX: Use cveId field (not id)
  const prevCVEMap = new Map(previousCVEs.map(cve => [cve.cveId, cve]));
  const currCVEMap = new Map(currentCVEs.map(cve => [cve.cveId, cve]));

  // Detect NEW CVEs (not in previous scan)
  for (const [cveId, cve] of currCVEMap) {
    if (!prevCVEMap.has(cveId)) {
      // Only notify for HIGH/CRITICAL CVEs by default
      if (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') {
        changes.push({
          organizationId,
          deviceId,
          scanRunId,
          type: 'NEW_CVE',
          severity: cve.severity,
          title: `${cve.severity} vulnerability ${cveId} detected`,
          message: cve.description?.slice(0, 200), // Truncate long descriptions
          data: {
            cveId,
            cvss: cve.cvssScore,
            severity: cve.severity,
            description: cve.description,
            affectedService: cve.affectedService,
            port: cve.port,
          },
          fingerprint: `new_cve:${deviceId}:${cveId}`,
          suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      }
    }
  }

  // Detect CVE severity UPGRADES
  for (const [cveId, currCVE] of currCVEMap) {
    const prevCVE = prevCVEMap.get(cveId);
    if (prevCVE && prevCVE.severity !== currCVE.severity) {
      const severityIncreased = compareSeverity(currCVE.severity, prevCVE.severity) > 0;

      if (severityIncreased && (currCVE.severity === 'CRITICAL' || currCVE.severity === 'HIGH')) {
        changes.push({
          organizationId,
          deviceId,
          scanRunId,
          type: 'CVE_SEVERITY_INCREASE',
          severity: currCVE.severity,
          title: `${cveId} severity upgraded to ${currCVE.severity}`,
          message: `Previously: ${prevCVE.severity}. ${currCVE.description?.slice(0, 150)}`,
          data: {
            cveId,
            oldSeverity: prevCVE.severity,
            newSeverity: currCVE.severity,
            cvss: currCVE.cvssScore,
            description: currCVE.description,
          },
          fingerprint: `cve_upgrade:${deviceId}:${cveId}`,
          suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
      }
    }
  }

  return changes;
}
```

### Baseline Selection Strategy

**Query**: Fetch last successful scan for same device

**File**: `packages/data-ops/src/queries/scans.ts`

```typescript
/**
 * Get the most recent successful scan for a device
 * Used as baseline for change detection
 *
 * BUG FIX: Join on runId (not scanRunId)
 */
export async function getLastSuccessfulScanForDevice(
  params: GetLastSuccessfulScanParams
): Promise<typeof scanRuns.$inferSelect | null> {
  const db = getDb();
  const { deviceId, organizationId, excludeScanId } = params;

  const conditions = [
    eq(scanRunDevices.deviceId, deviceId),
    eq(scanRuns.organizationId, organizationId),
    eq(scanRuns.status, 'SUCCEEDED'),
    isNotNull(scanRuns.resultSummary), // Must have results to compare
  ];

  if (excludeScanId) {
    // ✅ FIX: Use ne() instead of SQL template
    conditions.push(ne(scanRuns.id, excludeScanId));
  }

  const [baseline] = await db
    .select()
    .from(scanRuns)
    // ✅ FIX: Join on runId (not scanRunId)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(...conditions))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1);

  return baseline?.scan_runs || null;
}
```

---

## Notification Catalog

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

## Deduplication Strategy

### Problem

Without deduplication, users get flooded with duplicate notifications:
- Port 22 flaps (open → closed → open) = 3 notifications in 10 minutes
- Same CVE reported in multiple scans = spam
- Scheduled scans every hour = 24 identical notifications per day

### Solution: Multi-Layer Defense

#### Layer 1: Database-Level Unique Constraint

**File**: `packages/data-ops/src/schema/notifications.ts:69`

```typescript
fingerprintUniqueIdx: uniqueIndex('notifications_fingerprint_unique_idx')
  .on(t.organizationId, t.fingerprint)
```

**Why**: Provides database-level safety. Even if application logic has a race condition, the database will reject duplicate inserts.

**Trade-off**: Full unique index (not partial with `WHERE suppressUntil > CURRENT_TIMESTAMP`) for simplicity and SQLite version compatibility. Application-level cleanup handles expired suppressions.

**Future Enhancement**: Switch to partial index via custom SQL migration to allow fingerprint reuse after suppress window expires.

#### Layer 2: Atomic Check-and-Insert with Transactions

**File**: `packages/data-ops/src/queries/notifications.ts:157`

**CRITICAL FIX**: Race condition where two workers could both see "no duplicate" and insert.

**Before (Race Condition)**:
```typescript
// ❌ WRONG - Not atomic
const existing = await checkDuplicateNotification(fingerprint);
if (existing) return;
await insertNotification(data);
```

**After (Atomic)**:
```typescript
// ✅ CORRECT - Atomic with transaction
const notification = await db.transaction(async (tx) => {
  const now = new Date();

  // Check for duplicate within transaction (holds read lock)
  const [existing] = await tx
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, input.organizationId),
        eq(notifications.fingerprint, input.fingerprint),
        gt(notifications.suppressUntil, now)
      )
    )
    .limit(1);

  // Skip if duplicate exists
  if (existing) {
    console.log(`[Notifications] Suppressed duplicate: ${input.fingerprint}`);
    return null;
  }

  // Insert notification atomically
  const validated = CreateNotificationSchema.parse(input);
  const id = createId();

  const [created] = await tx
    .insert(notifications)
    .values({
      id,
      organizationId: validated.organizationId,
      // ... rest of fields
    })
    .returning();

  return created;
});

// Add to results if created (not suppressed)
if (notification) {
  created.push(notification);
}
```

**Why**: The transaction ensures check-and-insert is atomic. Even under high concurrency, only one worker can insert for a given fingerprint.

**Belt-and-Suspenders**: Combined with the unique index, this provides defense in depth.

#### Layer 3: Suppress Windows

Different change types have different suppress durations:

| Change Type | Suppress Duration | Rationale |
|-------------|------------------|-----------|
| `NEW_PORT` | 6 hours | Ports can flap during maintenance windows |
| `CLOSED_PORT` | 6 hours | Same as above |
| `NEW_CVE` | 24 hours | CVE databases update daily |
| `CVE_SEVERITY_INCREASE` | 24 hours | Severity changes are rare |

**Implementation**:
```typescript
function calculateSuppressUntil(type: string): Date {
  const now = new Date();
  const durations: Record<string, number> = {
    NEW_PORT: 6 * 60 * 60 * 1000,           // 6 hours
    CLOSED_PORT: 6 * 60 * 60 * 1000,        // 6 hours
    NEW_CVE: 24 * 60 * 60 * 1000,           // 24 hours
    CVE_SEVERITY_INCREASE: 24 * 60 * 60 * 1000, // 24 hours
  };

  const duration = durations[type] || 6 * 60 * 60 * 1000; // Default 6h
  return new Date(now.getTime() + duration);
}
```

**Usage**:
```typescript
suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000) // NEW_PORT
suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // NEW_CVE
```

---

## Design Decisions

### Org-Wide vs User-Scoped Read State

**Decision**: Notifications use **org-wide read state** (not per-user).

**Rationale**:
- Security notifications are **org-wide events** (port openings, CVEs) that affect the entire organization
- When one admin marks notifications as read, it signals the team has reviewed the security event
- Simplifies implementation (no user junction table needed)
- Matches legacy footprint pattern

**Code**:
```typescript
/**
 * Mark all notifications as read for entire organization
 *
 * IMPORTANT: This marks ALL org notifications as read, not just the current user's.
 * Design Decision: Security notifications are org-wide events that affect the entire
 * organization. When one admin marks notifications as read, it signals the team has
 * reviewed the security event.
 *
 * Alternative: If you want user-scoped read status, add a separate "user_read_status"
 * junction table to track per-user read state while keeping org-wide notifications.
 */
export const markAllNotificationsAsReadData = createServerFn({
  method: 'POST',
})
  .inputValidator(() => ({}))
  .handler(async () => {
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentUser();

    logger.info('Marking all org notifications as read (org-wide action)', {
      organizationId,
      userId: user.id,
      note: 'This marks ALL org notifications, not just current user',
    });

    const count = await markAllNotificationsAsRead(organizationId);
    return { success: true, count };
  });
```

**Future Enhancement**: If per-user read state is needed, create a `user_notification_reads` junction table:
```typescript
export const userNotificationReads = sqliteTable('user_notification_reads', {
  userId: text('user_id').notNull().references(() => auth_user.id),
  notificationId: text('notification_id').notNull().references(() => notifications.id),
  readAt: integer('read_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.notificationId] }),
}));
```

### Full Unique Index vs Partial Index

**Decision**: Use **full unique index** on `(organizationId, fingerprint)`.

**Trade-off**:
- ✅ **Pro**: Simple, reliable, works on all SQLite versions
- ✅ **Pro**: Enforces database-level safety regardless of application logic
- ❌ **Con**: Cannot reuse fingerprints even after suppress window expires

**Future Enhancement**: Switch to partial index for fingerprint reuse:
```sql
-- Custom migration (future)
DROP INDEX notifications_fingerprint_unique_idx;
CREATE UNIQUE INDEX notifications_fingerprint_active_idx
ON notifications (organization_id, fingerprint)
WHERE suppress_until > CURRENT_TIMESTAMP;
```

**Current Workaround**: Application-level cleanup deletes old notifications, freeing up fingerprints.

### Suppress Windows (Configurable vs Fixed)

**Decision**: Use **fixed suppress windows** (6h for ports, 24h for CVEs).

**Rationale**:
- Simpler implementation (no preferences system needed)
- Reasonable defaults for most use cases
- Can be made configurable in Phase 2 with user preference system

**Future Enhancement**: Per-org or per-user suppress window preferences:
```typescript
export const notificationPreferences = sqliteTable('notification_preferences', {
  organizationId: text('organization_id').notNull(),
  portSuppressHours: integer('port_suppress_hours').notNull().default(6),
  cveSuppressHours: integer('cve_suppress_hours').notNull().default(24),
});
```

---

## Bug Fixes & Improvements

### Critical Bug #1: Stale Scan Data (HIGH Severity)

**Location**: `apps/user-application/src/server/postback/handlers/port-scan.ts:503`

**Problem**: `detectScanChanges` received the `scanRun` object that was fetched **before** the database update. The `resultSummary` field was null/outdated, causing the change detector to exit early and skip all notifications.

**Root Cause**:
```typescript
// Line 220: Fetch scan run
const scanRun = await getScanRunById({ scanRunId, organizationId });

// Lines 345-380: Build and persist resultSummary
const resultSummary = buildResultSummary(...);
await updateScanRunResultSummary(scanRunId, resultSummary);

// Line 503: Pass stale scanRun to change detector
const changes = await detectScanChanges({
  deviceId,
  currentScan: scanRun, // ❌ STALE - resultSummary is null!
  organizationId,
});
```

**Fix**:
```typescript
// ✅ FIXED: Pass fresh scan data with updated resultSummary
const freshScanData = {
  ...scanRun,
  resultSummary, // Use the freshly built resultSummary from line 345
};

const changes = await detectScanChanges({
  deviceId,
  currentScan: freshScanData, // ✅ FRESH - has current scan results
  organizationId,
});
```

**Impact**: Without this fix, **no notifications would ever be created** because the change detector always saw empty results.

**Verification**:
```typescript
// Test that change detector receives fresh data
it('should pass fresh scan data to change detector', () => {
  expect(detectScanChanges).toHaveBeenCalledWith({
    deviceId: 'dev_123',
    currentScan: expect.objectContaining({
      resultSummary: expect.objectContaining({
        ports: expect.any(Array),
        cveEnrichment: expect.any(Object),
      }),
    }),
    organizationId: 'org_123',
  });
});
```

### Critical Bug #2: Race Condition in Deduplication (MEDIUM Severity)

**Location**: `packages/data-ops/src/queries/notifications.ts:157`

**Problem**: The `createNotifications` function performed read-then-write serially but without transaction safety. Two workers processing the same fingerprint could both see "no duplicate" and insert, defeating the suppression window.

**Root Cause**:
```typescript
// ❌ WRONG - Not atomic
async function createNotifications(inputs) {
  for (const input of inputs) {
    // Read
    const existing = await checkDuplicateNotification(input.fingerprint);

    // Gap here - another worker could insert!

    // Write
    if (!existing) {
      await insertNotification(input);
    }
  }
}
```

**Fix**: Wrapped check-and-insert in database transaction.

**Implementation**: See [Layer 2: Atomic Check-and-Insert with Transactions](#layer-2-atomic-check-and-insert-with-transactions) above.

**Belt-and-Suspenders**: Added unique index on `(organizationId, fingerprint)` for database-level safety.

**Impact**: Without this fix, duplicate notifications could be created under concurrent scan workloads.

### Bug Fix #3: CVE Map Keys (CRITICAL)

**Location**: `apps/user-application/src/server/notifications/change-detector.ts:456`

**Problem**: Used `cve.id` but enrichment exposes `cveId`.

**Before**:
```typescript
// ❌ WRONG
const prevCVEMap = new Map(previousCVEs.map(cve => [cve.id, cve]));
```

**After**:
```typescript
// ✅ CORRECT
const prevCVEMap = new Map(previousCVEs.map(cve => [cve.cveId, cve]));
```

**Impact**: CVE diffs would fail, causing all CVEs to appear as "new" on every scan.

### Bug Fix #4: Baseline Query Join Column

**Location**: `packages/data-ops/src/queries/scans.ts:597`

**Problem**: Joined on `scanRunDevices.scanRunId` but actual column is `runId`.

**Before**:
```typescript
// ❌ WRONG
.innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.scanRunId))
```

**After**:
```typescript
// ✅ CORRECT
.innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
```

**Impact**: Baseline query would throw, preventing all change detection.

### Bug Fix #5: Service Name Interpolation

**Location**: `apps/user-application/src/server/notifications/change-detector.ts:360`

**Problem**: `port.service` can be an object, would render `[object Object]`.

**Before**:
```typescript
// ❌ WRONG
const serviceName = port.service || 'service';
```

**After**:
```typescript
// ✅ CORRECT
const serviceName = port.service?.name || port.service?.product || port.service || 'service';
```

**Impact**: Notification titles would be unreadable (e.g., "New [object Object] on port 22 discovered").

### Bug Fix #6: Timestamp Schema Helpers

**Location**: `packages/data-ops/src/schema/notifications.ts:53-54`

**Problem**: Used raw SQL for timestamps instead of Drizzle helpers.

**Before**:
```typescript
// ❌ WRONG
createdAt: integer('created_at', { mode: 'timestamp_ms' })
  .notNull()
  .default(sql`(unixepoch())`),
```

**After**:
```typescript
// ✅ CORRECT
createdAt: now(),
updatedAt: updatedAt(),
```

**Impact**: Simplified schema, leverages Drizzle type safety.

### Bug Fix #7: Suppress Until Data Type

**Location**: `packages/data-ops/src/queries/notifications.ts:184`

**Problem**: Used `.getTime()` instead of passing Date object.

**Before**:
```typescript
// ❌ WRONG
suppressUntil: validated.suppressUntil.getTime()
```

**After**:
```typescript
// ✅ CORRECT
suppressUntil: validated.suppressUntil // Drizzle handles conversion
```

**Impact**: Drizzle's `mode: 'timestamp_ms'` automatically converts Date to Unix milliseconds.

### Bug Fix #8: Dedupe Check Comparison

**Location**: `packages/data-ops/src/queries/notifications.ts:172`

**Problem**: Used `gte()` instead of `gt()` for suppress window check.

**Before**:
```typescript
// ❌ WRONG
gte(notifications.suppressUntil, now) // Suppress if >= now
```

**After**:
```typescript
// ✅ CORRECT
gt(notifications.suppressUntil, now) // Suppress if > now (future)
```

**Impact**: Prevents edge case where expired suppression (exactly now) is treated as active.

---

## Testing

### Integration Tests

**File**: `apps/user-application/src/server/__tests__/notifications-integration.test.ts`

```typescript
describe('Notification System Integration', () => {
  it('should create notification for new port', async () => {
    const notification = await createNotification({
      organizationId: 'org_test',
      deviceId: 'dev_test',
      type: 'NEW_PORT',
      severity: 'HIGH',
      title: 'New RDP port 3389 discovered',
      fingerprint: 'new_port:dev_test:3389:tcp',
      suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });

    expect(notification.id).toBeDefined();
    expect(notification.severity).toBe('HIGH');
  });

  it('should suppress duplicate notifications', async () => {
    const fingerprint = 'test_duplicate';

    // Create first notification
    await createNotification({
      organizationId: 'org_test',
      type: 'NEW_PORT',
      severity: 'MEDIUM',
      title: 'Test',
      fingerprint,
      suppressUntil: new Date(Date.now() + 60000), // 1 minute
    });

    // Check if suppressed
    const suppressed = await checkDuplicateNotification({
      organizationId: 'org_test',
      fingerprint,
    });

    expect(suppressed).toBe(true);
  });

  it('should detect port changes', async () => {
    // Setup baseline scan
    const baseline = await createScanRun({
      deviceId: 'dev_test',
      organizationId: 'org_test',
      resultSummary: {
        ports: [{ port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } }],
      },
    });

    // New scan with port 3389
    const newScan = await createScanRun({
      deviceId: 'dev_test',
      organizationId: 'org_test',
      resultSummary: {
        ports: [
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } },
          { port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server' } },
        ],
      },
    });

    // Detect changes
    const changes = await detectScanChanges({
      deviceId: 'dev_test',
      currentScan: newScan,
      organizationId: 'org_test',
    });

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('NEW_PORT');
    expect(changes[0].data.port).toBe(3389);
  });
});
```

### Unit Tests

**File**: `apps/user-application/src/server/notifications/__tests__/change-detector.test.ts`

```typescript
describe('Change Detector', () => {
  describe('diffPorts', () => {
    it('should detect new open port', () => {
      const previous = {
        ports: [{ port: 80, protocol: 'tcp', state: 'open', service: { name: 'http' } }],
      };

      const current = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: { name: 'http' } },
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } },
        ],
      };

      const changes = diffPorts(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_PORT');
      expect(changes[0].data.port).toBe(22);
      expect(changes[0].fingerprint).toBe('new_port:dev_123:22:tcp');
    });

    it('should assign HIGH severity to RDP port', () => {
      const previous = { ports: [] };
      const current = {
        ports: [{ port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server' } }],
      };

      const changes = diffPorts(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes[0].severity).toBe('HIGH');
    });
  });

  describe('diffCVEs', () => {
    it('should detect new critical CVE', () => {
      const previous = {
        cveEnrichment: {
          os: { cves: [{ cveId: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 }] },
        },
      };

      const current = {
        cveEnrichment: {
          os: {
            cves: [
              { cveId: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 },
              { cveId: 'CVE-2024-5678', severity: 'CRITICAL', cvssScore: 9.8, description: 'RCE vulnerability' },
            ],
          },
        },
      };

      const changes = diffCVEs(current, previous, 'dev_123', 'org_123', 'run_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_CVE');
      expect(changes[0].severity).toBe('CRITICAL');
      expect(changes[0].data.cveId).toBe('CVE-2024-5678');
    });
  });
});
```

---

## API Reference

### Server Functions

**File**: `apps/user-application/src/server/notifications.ts`

#### `getNotificationsData`
- **Method**: POST
- **Input**: `{ unreadOnly?: boolean, deviceId?: string, limit?: number, offset?: number }`
- **Returns**: `{ success: boolean, items: Notification[], total: number, hasMore: boolean }`
- **Description**: Get notifications for current organization

#### `getUnreadNotificationCountData`
- **Method**: GET
- **Input**: None
- **Returns**: `{ success: boolean, count: number }`
- **Description**: Get count of unread notifications for badge

#### `markNotificationAsReadData`
- **Method**: POST
- **Input**: `{ notificationId: string }`
- **Returns**: `{ success: boolean, notification: Notification }`
- **Description**: Mark single notification as read

#### `markAllNotificationsAsReadData`
- **Method**: POST
- **Input**: None
- **Returns**: `{ success: boolean, count: number }`
- **Description**: Mark all notifications as read for organization (org-wide action)

### Data-Ops Queries

**File**: `packages/data-ops/src/queries/notifications.ts`

#### `createNotifications(inputs: CreateNotificationInput[])`
Creates notifications with atomic deduplication. Skips duplicates within suppress window.

#### `getNotifications(params: GetNotificationsInput)`
Fetches notifications with pagination and filtering.

#### `getUnreadNotificationCount(params: { organizationId, userId })`
Returns count for badge display.

#### `markNotificationAsRead(params: { notificationId, organizationId })`
Marks single notification as read.

#### `markAllNotificationsAsRead(organizationId: string)`
Marks all unread notifications as read (org-wide).

#### `checkDuplicateNotification(params: { organizationId, fingerprint })`
Checks if notification should be suppressed based on fingerprint + suppressUntil.

#### `deleteOldNotifications(organizationId: string, daysOld: number)`
Deletes read notifications older than specified days.

#### `getLastSuccessfulScanForDevice(params: GetLastSuccessfulScanParams)`
Fetches baseline scan for change detection.

---

## Future Enhancements

### Phase 2: Advanced Features

#### 1. Email Delivery
- Transactional emails for CRITICAL/HIGH severity
- Plain text template (MVP)
- HTML template with branding (Phase 3)
- Cloudflare Email Workers binding

#### 2. Notification Catalog Integration
- Refactor change detector to use catalog functions
- Remove inline message strings
- Centralize all copy in catalog module

#### 3. Message Hashing (Secondary Deduplication)
- Hash final message as secondary fingerprint
- Protects against accidental fingerprint divergence
- Legacy pattern from footprint system

#### 4. Partial Unique Index
- Switch to `WHERE suppressUntil > CURRENT_TIMESTAMP`
- Allows fingerprint reuse after suppress window expires
- Custom SQL migration (requires SQLite 3.15+)

#### 5. User Preferences
- Per-user notification settings
- Channel preferences (email, Slack, SMS)
- Severity thresholds
- Quiet hours
- Device watch list

#### 6. Webhook Integrations
- Slack incoming webhooks
- Discord webhooks
- PagerDuty integration
- Custom HTTP endpoints

#### 7. Digest Mode
- Daily/weekly email rollups
- Group by device, severity, type
- Scheduled via Cloudflare Cron Triggers

#### 8. Rate Limiting Enhancements
- Per-device daily caps (10/day)
- Auto-suppress noisy devices
- Anomaly detection

#### 9. Notification History
- Archive read notifications after 60-90 days
- Notification timeline view
- Diff viewer
- Acknowledgment workflow

#### 10. Extended Change Detection
- Httpx artifact changes
- Screenshot diffs
- Discovery scan changes
- Certificate expiration warnings

---

## Comparison: SEC vs Legacy Footprint

### Pipeline Architecture

#### SEC (Modern) Pipeline

```
Restate worker → port scan postback handler
    ↓ normalize resultSummary (ports + CVE enrichment)
persist scanRuns.resultSummary
    ↓
detectScanChanges(deviceId, currentScan, orgId)
    ↳ getBaselineScan(...) → previous SUCCEEDED scan run
    ↳ diffPorts(...) → NEW_PORT / CLOSED_PORT
    ↳ diffCVEs(...) → NEW_CVE / CVE_SEVERITY_INCREASE (only HIGH/CRITICAL)
    ↓
createNotifications([...changes]) → fingerprint dedupe + suppress windows
    ↓
notifications table
    ↓
NotificationBell / NotificationList render in UI
```

**Key Points**:
- Baseline is the last stored `scanRuns.resultSummary`
- Change detector produces normalized change objects before hitting the DB
- Messages are centralized in notification catalog
- Dedupe uses transactions + unique index

#### Legacy Footprint Pipeline

```
Celery results processor → parse per-device JSON (ports, OS, vulns)
    ↓
OperatingSystem.update_daemons(newDaemons)
    ↳ daemon.compare_to(newDaemon)
        • New daemon? insert_daemon → Notification.new_device / new_webapp
        • Status flip? Notification.up_status_app / down_status_app
        • Parameter change? Notification.change_daemon_product/version
        • First-time up? search_vulnerabilities()
            ↳ vulnerability_scanner.compare(...) → added/fixed/unfixed CVEs
                • Send Notification.critical_new / fix / unfix etc.
    ↓
Notification.create_notification()
    ↳ hash(message) + elem unique constraint
    ↳ store tenant/module/priority, bump timestamp on duplicate
    ↓
REST view → convert_notifications(...) → front end
```

**Key Points**:
- Baseline is the live ORM state (daemons/vulnerabilities)
- Notification templates live in `notifications/messages.py`
- Dedup is enforced at the DB layer via unique index and `get_or_create`

### Feature Comparison

| Feature | SEC (Modern) | Legacy Footprint |
|---------|-------------|------------------|
| **Raw ingest** | Snapshot recorded to `scanRuns.resultSummary` | Merge into persisted device/app models |
| **Baseline lookup** | Explicit `getBaselineScan` (previous SUCCEEDED run) | Implicit current state in DAOs |
| **Port diff** | Functional diff of JSON arrays | Application logic in `OperatingSystem.update_daemons` |
| **CVE diff** | `diffCVEs` against enrichment JSON | `vulnerability_scanner.compare` against ORM |
| **Notification text** | Centralized catalog module | `notifications/messages.py` |
| **Dedup** | Transactions + unique index | `message_hashed` + element unique constraint with `get_or_create` |
| **Presentation** | React components render API response | Django converts ORM objects to response dicts |

### Patterns Adopted from Legacy

1. ✅ **Template/Catalog Pattern**: Centralized messaging in `catalog.ts` (like `messages.py`)
2. ✅ **Unique Constraint**: Database-level deduplication (like `message_hashed` + `elem`)
3. ✅ **Atomic Creation**: Transaction-based check-and-insert (like `get_or_create`)
4. ✅ **Tenant Scoping**: Org-wide filtering (like `tenant` FK)
5. ✅ **Suppress Windows**: Time-based deduplication
6. ✅ **Severity Mapping**: Centralized port severity map

### Improvements Over Legacy

1. ✅ **Snapshot-Based Baselines**: Explicit scan history (not live state mutation)
2. ✅ **Functional Change Detection**: Pure functions (not ORM side effects)
3. ✅ **Type Safety**: Zod validation + TypeScript (not Django ORM)
4. ✅ **Modern Stack**: TanStack Query + React 19 (not Django templates)
5. ✅ **Drizzle ORM**: Type-safe queries (not raw SQL)
6. ✅ **Structured Fingerprints**: Explicit fingerprint format (not message hashing)

---

## References

### Related Documentation

- [Postback Architecture](./postback-architecture.md)
- [Legacy Notification System](./LEGACY_NOTIFICATIONS.md)
- [CVE Enrichment](./CVE_ENRICHMENT.md)

### Related Files

- Port scan handler: `apps/user-application/src/server/postback/handlers/port-scan.ts`
- Change detector: `apps/user-application/src/server/notifications/change-detector.ts`
- Notification catalog: `packages/data-ops/src/notifications/catalog.ts`
- Data-ops queries: `packages/data-ops/src/queries/notifications.ts`
- Schema: `packages/data-ops/src/schema/notifications.ts`
- Server functions: `apps/user-application/src/server/notifications.ts`
- UI components: `apps/user-application/src/components/notifications/`

### External Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- [CVSS Severity Ratings](https://nvd.nist.gov/vuln-metrics/cvss)

---

**Last Updated**: 2025-11-09
**Status**: ✅ MVP Complete - Ready for end-to-end testing
**Next Action**: Run full scan → verify notifications → test deduplication
