# Notification System Design

**Status**: Planning Phase
**Target**: MVP in 3 weeks
**Owner**: Security Monitoring Team

---

## Overview

The notification system alerts users when security scans detect meaningful changes:
- New open ports discovered
- Previously open ports closed
- New vulnerabilities (CVEs) detected
- CVE severity upgrades

This document outlines the architecture, data flow, implementation plan, and key decisions.

---

## Table of Contents

1. [Current State](#current-state)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Change Detection](#change-detection)
5. [Delivery Channels](#delivery-channels)
6. [Deduplication & Noise Control](#deduplication--noise-control)
7. [Implementation Plan](#implementation-plan)
8. [API Reference](#api-reference)
9. [Future Enhancements](#future-enhancements)

---

## Current State

### Existing Infrastructure

**Scan Pipeline** (`apps/user-application/src/server/postback/handlers/port-scan.ts`)
```typescript
// Line 201: After persist, before return
async handleSuccess(payload: PortScanPostback, ctx: HandlerContext) {
  // 1. Update scan run status
  await updateScanRunStatus(...);

  // 2. Persist CVE enrichment
  await updateScanRunResultSummary(...);

  // ⚠️ NO DOWNSTREAM CHANGE HOOK YET
  // This is where we'll insert change detection

  return { success: true };
}
```

**Data Already Available**:
- `scan_runs.result_summary` contains normalized ports + CVE enrichment (JSON)
- `scan_run_devices` links runs to devices for historical comparison
- `updateScanRunStatus` merges structured summary, enabling clean diffs
- Both scheduled and manual scans flow through same pipeline

**Key Files**:
- Postback handler: `apps/user-application/src/server/postback/handlers/port-scan.ts`
- Scan queries: `packages/data-ops/src/queries/scans.ts`
- Schema: `packages/data-ops/src/schema/orchestration.ts`
- Port scan service: `apps/user-application/src/server/discovery/services/port-scan-service.ts`

---

## Architecture

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
│ 3. [NEW] Change Detection ◄─────────────────────────────────┐  │
│    - Load previous successful scan for device               │  │
│    - Diff current vs previous                               │  │
│    - Filter meaningful changes                              │  │
│ 4. [NEW] Create Notifications                               │  │
│    - Check deduplication (fingerprint + suppressUntil)      │  │
│    - Persist to notifications table                         │  │
│    - Track per-device rate limits                           │  │
│ 5. [NEW] Trigger Delivery                                   │  │
│    - In-app (stored in DB, shown in UI)                     │  │
│    - Email (for CRITICAL/HIGH severity)                     │  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ User Sees Notification                                          │
│ - Bell icon with badge count                                   │
│ - Notification dropdown/page                                   │
│ - Email (if configured + severity threshold met)               │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **PortScanHandler** | Orchestrates change detection after scan persist | `apps/user-application/src/server/postback/handlers/port-scan.ts:201` |
| **ChangeDetector** | Diffs scans, emits normalized change events | `apps/user-application/src/server/notifications/change-detector.ts` |
| **NotificationService** | Creates notifications, handles deduplication | `apps/user-application/src/server/notifications/service.ts` |
| **EmailWorker** | Sends transactional emails for high-severity events | `apps/user-application/src/server/notifications/email-worker.ts` |
| **UI Components** | Bell icon, dropdown, notification page | `apps/user-application/src/components/notifications/` |
| **Data Queries** | CRUD operations for notifications table | `packages/data-ops/src/queries/notifications.ts` |

---

## Data Model

### Schema: `notifications` Table

**File**: `packages/data-ops/src/schema/orchestration.ts`

```typescript
export const notifications = sqliteTable('notifications', {
  // Identity
  id: text('id').primaryKey(), // cuid2
  organizationId: text('organization_id').notNull(),
  userId: text('user_id'), // null = org-wide notification
  deviceId: text('device_id'), // null = org-level event
  scanRunId: text('scan_run_id').references(() => scanRuns.id),

  // Classification
  type: text('type').notNull(), // 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE'
  severity: text('severity').notNull(), // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

  // Content (preformatted for UI/email)
  title: text('title').notNull(), // "New SSH port 22 opened on web-server-01"
  message: text('message'), // Optional longer description
  data: text('data', { mode: 'json' }), // Structured change details (ports/CVEs)

  // Deduplication & Rate Limiting
  fingerprint: text('fingerprint'), // Hash of (deviceId + type + key details)
  suppressUntil: integer('suppress_until', { mode: 'timestamp' }), // Don't notify again until this time

  // Read Tracking
  readAt: integer('read_at', { mode: 'timestamp' }),

  // Delivery Tracking
  emailSent: integer('email_sent', { mode: 'boolean' }).default(false),
  emailSentAt: integer('email_sent_at', { mode: 'timestamp' }),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// Indexes for performance
CREATE INDEX idx_notifications_org_user_read ON notifications(organizationId, userId, readAt);
CREATE INDEX idx_notifications_device_created ON notifications(deviceId, createdAt DESC);
CREATE INDEX idx_notifications_fingerprint_suppress ON notifications(fingerprint, suppressUntil);
CREATE INDEX idx_notifications_unread ON notifications(organizationId, readAt) WHERE readAt IS NULL;
```

### Notification Types & Severity

| Type | Description | Default Severity | Fingerprint Format |
|------|-------------|-----------------|-------------------|
| `NEW_PORT` | Previously closed/unknown port is now open | Varies by port | `new_port:{deviceId}:{port}:{protocol}` |
| `CLOSED_PORT` | Previously open port is now closed/filtered | `LOW` | `closed_port:{deviceId}:{port}:{protocol}` |
| `NEW_CVE` | New vulnerability detected (wasn't in previous scan) | CVE severity | `new_cve:{deviceId}:{cve_id}` |
| `CVE_SEVERITY_INCREASE` | Existing CVE severity upgraded | New severity | `cve_upgrade:{deviceId}:{cve_id}` |

**Port Severity Mapping**:
```typescript
const PORT_SEVERITY_MAP: Record<number, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
  22: 'MEDIUM',   // SSH - common target
  23: 'HIGH',     // Telnet - insecure
  3389: 'HIGH',   // RDP - common attack vector
  445: 'HIGH',    // SMB - ransomware vector
  1433: 'MEDIUM', // MSSQL
  3306: 'MEDIUM', // MySQL
  5432: 'MEDIUM', // PostgreSQL
  6379: 'MEDIUM', // Redis
  27017: 'MEDIUM', // MongoDB
  // Default: LOW for unknown ports
};
```

### Example Notification Records

**New Port Notification**:
```json
{
  "id": "notif_abc123",
  "organizationId": "org_xyz",
  "userId": null,
  "deviceId": "dev_123",
  "scanRunId": "run_456",
  "type": "NEW_PORT",
  "severity": "HIGH",
  "title": "New RDP port 3389 opened on web-server-01",
  "message": "Remote Desktop Protocol (RDP) is now accessible. Ensure this is intentional and properly secured.",
  "data": {
    "port": 3389,
    "protocol": "tcp",
    "service": "ms-wbt-server",
    "state": "open",
    "deviceName": "web-server-01"
  },
  "fingerprint": "new_port:dev_123:3389:tcp",
  "suppressUntil": "2025-11-08T14:40:39Z", // 6 hours from now
  "readAt": null,
  "emailSent": true,
  "emailSentAt": "2025-11-08T08:40:40Z",
  "createdAt": "2025-11-08T08:40:39Z"
}
```

**New Critical CVE**:
```json
{
  "id": "notif_def456",
  "organizationId": "org_xyz",
  "userId": null,
  "deviceId": "dev_123",
  "scanRunId": "run_456",
  "type": "NEW_CVE",
  "severity": "CRITICAL",
  "title": "Critical vulnerability CVE-2024-1234 detected on web-server-01",
  "message": "OpenSSH remote code execution vulnerability (CVSS 9.8). Patch immediately.",
  "data": {
    "cveId": "CVE-2024-1234",
    "cvss": 9.8,
    "description": "Remote code execution in OpenSSH versions < 9.5",
    "affectedService": "OpenSSH 9.3",
    "port": 22,
    "deviceName": "web-server-01"
  },
  "fingerprint": "new_cve:dev_123:CVE-2024-1234",
  "suppressUntil": "2025-11-09T08:40:39Z", // 24 hours for CVEs
  "readAt": null,
  "emailSent": true,
  "emailSentAt": "2025-11-08T08:40:40Z",
  "createdAt": "2025-11-08T08:40:39Z"
}
```

---

## Change Detection

### Core Algorithm

**File**: `apps/user-application/src/server/notifications/change-detector.ts`

```typescript
import type { ScanRun } from '@repo/data-ops';

/**
 * Normalized change event emitted by detector
 */
export interface ScanChange {
  type: 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  message?: string;
  data: Record<string, any>; // Structured details for storage
  fingerprint: string; // For deduplication
}

/**
 * Detect changes between current and previous scan
 *
 * @param currentScan - Just-completed scan with results
 * @param previousScan - Last successful scan for same device (null if first scan)
 * @returns Array of change events to potentially notify about
 */
export async function detectChanges(
  currentScan: ScanRun,
  previousScan: ScanRun | null
): Promise<ScanChange[]> {
  const changes: ScanChange[] = [];

  // First scan for device - no baseline to compare
  if (!previousScan) {
    return changes;
  }

  // Ensure both scans have result summaries
  if (!currentScan.resultSummary || !previousScan.resultSummary) {
    return changes;
  }

  // Diff ports (open/closed state changes)
  changes.push(...diffPorts(
    currentScan.resultSummary,
    previousScan.resultSummary,
    currentScan.deviceId
  ));

  // Diff CVE enrichment (new vulnerabilities, severity changes)
  changes.push(...diffCVEs(
    currentScan.resultSummary,
    previousScan.resultSummary,
    currentScan.deviceId
  ));

  return changes;
}
```

### Port Diffing Logic

```typescript
/**
 * Compare port states between scans
 */
function diffPorts(
  current: any,
  previous: any,
  deviceId: string
): ScanChange[] {
  const changes: ScanChange[] = [];

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
      changes.push({
        type: 'NEW_PORT',
        severity: determinePortSeverity(port.port),
        title: `New ${port.service || 'service'} on port ${port.port} discovered`,
        message: getPortSecurityMessage(port),
        data: {
          port: port.port,
          protocol: port.protocol,
          service: port.service,
          state: port.state,
          version: port.version,
        },
        fingerprint: `new_port:${deviceId}:${port.port}:${port.protocol}`,
      });
    }
  }

  // Detect CLOSED ports (previously open, now closed/filtered)
  for (const [key, prevPort] of prevPortMap) {
    const wasOpen = prevPort.state === 'open';
    const currPort = currPortMap.get(key);
    const isNowOpen = currPort && currPort.state === 'open';

    if (wasOpen && !isNowOpen) {
      changes.push({
        type: 'CLOSED_PORT',
        severity: 'LOW', // Port closing is usually less urgent
        title: `Port ${prevPort.port} (${prevPort.service || 'unknown'}) is now closed`,
        message: undefined,
        data: {
          port: prevPort.port,
          protocol: prevPort.protocol,
          service: prevPort.service,
          previousState: prevPort.state,
        },
        fingerprint: `closed_port:${deviceId}:${prevPort.port}:${prevPort.protocol}`,
      });
    }
  }

  return changes;
}

/**
 * Determine notification severity based on port number
 */
function determinePortSeverity(port: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  // Known high-risk ports
  if ([23, 3389, 445].includes(port)) return 'HIGH';

  // Common database/service ports
  if ([22, 1433, 3306, 5432, 6379, 27017].includes(port)) return 'MEDIUM';

  // Default: low severity for unknown ports
  return 'LOW';
}

/**
 * Generate security-focused message for port change
 */
function getPortSecurityMessage(port: any): string | undefined {
  const messages: Record<number, string> = {
    23: 'Telnet is an insecure protocol. Consider using SSH instead.',
    3389: 'RDP is a common attack vector. Ensure strong passwords and consider VPN access.',
    445: 'SMB is frequently targeted by ransomware. Verify this exposure is intentional.',
    6379: 'Redis is exposed. Ensure authentication is enabled and strong.',
    27017: 'MongoDB is exposed. Verify authentication and network restrictions.',
  };

  return messages[port.port];
}
```

### CVE Diffing Logic

```typescript
/**
 * Compare CVE enrichment between scans
 */
function diffCVEs(
  current: any,
  previous: any,
  deviceId: string
): ScanChange[] {
  const changes: ScanChange[] = [];

  const currentCVEs = extractCVEsFromEnrichment(current.cveEnrichment);
  const previousCVEs = extractCVEsFromEnrichment(previous.cveEnrichment);

  // Build CVE maps: cveId → CVE object
  const prevCVEMap = new Map(previousCVEs.map(cve => [cve.id, cve]));
  const currCVEMap = new Map(currentCVEs.map(cve => [cve.id, cve]));

  // Detect NEW CVEs (not in previous scan)
  for (const [cveId, cve] of currCVEMap) {
    if (!prevCVEMap.has(cveId)) {
      // Only notify for HIGH/CRITICAL CVEs by default
      if (cve.severity === 'CRITICAL' || cve.severity === 'HIGH') {
        changes.push({
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
        });
      }
    }
  }

  // Detect CVE severity UPGRADES (was MEDIUM, now HIGH)
  for (const [cveId, currCVE] of currCVEMap) {
    const prevCVE = prevCVEMap.get(cveId);
    if (prevCVE && prevCVE.severity !== currCVE.severity) {
      const severityIncreased = compareSeverity(currCVE.severity, prevCVE.severity) > 0;

      if (severityIncreased && (currCVE.severity === 'CRITICAL' || currCVE.severity === 'HIGH')) {
        changes.push({
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
        });
      }
    }
  }

  return changes;
}

/**
 * Extract flat list of CVEs from enrichment structure
 */
function extractCVEsFromEnrichment(enrichment: any): Array<{
  id: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
}> {
  if (!enrichment) return [];

  const cves: any[] = [];

  // CVEs from OS
  if (enrichment.os?.cves) {
    cves.push(...enrichment.os.cves.map((cve: any) => ({
      ...cve,
      affectedService: enrichment.os.product,
    })));
  }

  // CVEs from applications
  if (enrichment.applications) {
    for (const app of enrichment.applications) {
      if (app.cves) {
        cves.push(...app.cves.map((cve: any) => ({
          ...cve,
          affectedService: `${app.name} ${app.version}`,
          port: app.port,
        })));
      }
    }
  }

  return cves;
}

/**
 * Compare severity levels (higher = more severe)
 */
function compareSeverity(a: string, b: string): number {
  const order = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
}
```

### Baseline Selection Strategy

**Query**: Fetch last successful scan for same device

```typescript
// packages/data-ops/src/queries/scans.ts

/**
 * Get the most recent successful scan for a device
 * Used as baseline for change detection
 *
 * @param deviceId - Device to find baseline for
 * @param organizationId - Organization context
 * @param beforeScanId - Optional: exclude this scan (use when comparing during postback)
 */
export async function getLastSuccessfulScanForDevice(
  deviceId: string,
  organizationId: string,
  beforeScanId?: string
): Promise<ScanRun | null> {
  const db = getDb();

  const conditions = [
    eq(scanRunDevices.deviceId, deviceId),
    eq(scanRuns.organizationId, organizationId),
    eq(scanRuns.status, 'SUCCEEDED'),
    isNotNull(scanRuns.resultSummary), // Must have results to compare
  ];

  // Exclude current scan if provided
  if (beforeScanId) {
    conditions.push(ne(scanRuns.id, beforeScanId));
  }

  const [baseline] = await db
    .select()
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.scanRunId))
    .where(and(...conditions))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1);

  return baseline?.scan_runs || null;
}
```

---

## Delivery Channels

### MVP Channels

1. **In-App Notifications** (Priority 1)
   - Bell icon with unread badge
   - Notification dropdown (recent 10)
   - Full notification page (paginated)
   - Real-time updates via polling

2. **Email** (Priority 2)
   - Transactional emails for CRITICAL/HIGH severity
   - Simple text template (no HTML in MVP)
   - Sent via Cloudflare Email Workers binding

### Phase 2 Channels (Future)

- Slack webhook integration
- Discord webhook integration
- SMS (Twilio) for critical alerts
- PagerDuty integration
- Custom webhooks (user-defined)

---

## Deduplication & Noise Control

### Strategy

**Problem**: Without deduplication, users get flooded with duplicate notifications:
- Port 22 flaps (open → closed → open) = 3 notifications in 10 minutes
- Same CVE reported in multiple scans = spam
- Scheduled scans every hour = 24 identical notifications per day

**Solution**: Multi-layer filtering

#### Layer 1: Fingerprint-Based Deduplication

Each notification has a unique fingerprint based on:
- Device ID
- Change type
- Specific detail (port number, CVE ID, etc.)

Example: `new_port:dev_123:22:tcp`

**Rule**: If a notification with the same fingerprint exists AND its `suppressUntil` is in the future, skip creation.

```typescript
// apps/user-application/src/server/notifications/service.ts

async function shouldSuppressNotification(
  fingerprint: string,
  organizationId: string,
  now: Date
): Promise<boolean> {
  const db = getDb();

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.fingerprint, fingerprint),
        gt(notifications.suppressUntil, now) // suppressUntil in future
      )
    )
    .limit(1);

  return !!existing;
}
```

#### Layer 2: Suppress Windows

Different change types have different suppress durations:

| Change Type | Suppress Duration | Rationale |
|-------------|------------------|-----------|
| `NEW_PORT` | 6 hours | Ports can flap during maintenance windows |
| `CLOSED_PORT` | 6 hours | Same as above |
| `NEW_CVE` | 24 hours | CVE databases update daily |
| `CVE_SEVERITY_INCREASE` | 24 hours | Severity changes are rare |

```typescript
function calculateSuppressUntil(change: ScanChange): Date {
  const now = new Date();
  const durations: Record<string, number> = {
    NEW_PORT: 6 * 60 * 60 * 1000,           // 6 hours
    CLOSED_PORT: 6 * 60 * 60 * 1000,        // 6 hours
    NEW_CVE: 24 * 60 * 60 * 1000,           // 24 hours
    CVE_SEVERITY_INCREASE: 24 * 60 * 60 * 1000, // 24 hours
  };

  const duration = durations[change.type] || 6 * 60 * 60 * 1000; // Default 6h
  return new Date(now.getTime() + duration);
}
```

#### Layer 3: Per-Device Rate Limiting (Future)

Cap notifications per device per day to prevent spam from noisy assets.

**Not implemented in MVP**, but schema supports it via query:

```sql
-- Check how many notifications sent today for this device
SELECT COUNT(*)
FROM notifications
WHERE deviceId = ?
  AND createdAt >= datetime('now', '-1 day');
```

If count exceeds threshold (e.g., 10/day), suppress additional notifications until next day.

---

## Implementation Plan

### Week 1: Core Infrastructure

**Goal**: Database schema, CRUD operations, change detection logic

#### Task 1.1: Schema & Migration

**Files to create**:
- `packages/data-ops/migrations/000X_notifications.sql`

**Schema** (see [Data Model](#data-model) section above)

**Migration SQL**:
```sql
-- Create notifications table
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT,
  scan_run_id TEXT REFERENCES scan_runs(id),

  type TEXT NOT NULL CHECK(type IN ('NEW_PORT', 'CLOSED_PORT', 'NEW_CVE', 'CVE_SEVERITY_INCREASE')),
  severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),

  title TEXT NOT NULL,
  message TEXT,
  data TEXT, -- JSON

  fingerprint TEXT,
  suppress_until INTEGER, -- Unix timestamp

  read_at INTEGER, -- Unix timestamp

  email_sent INTEGER DEFAULT 0,
  email_sent_at INTEGER, -- Unix timestamp

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX idx_notifications_org_user_read ON notifications(organization_id, user_id, read_at);
CREATE INDEX idx_notifications_device_created ON notifications(device_id, created_at DESC);
CREATE INDEX idx_notifications_fingerprint_suppress ON notifications(fingerprint, suppress_until);
CREATE INDEX idx_notifications_unread ON notifications(organization_id, read_at) WHERE read_at IS NULL;

-- Foreign key enforcement
CREATE INDEX idx_notifications_scan_run ON notifications(scan_run_id);
```

**Testing**:
```bash
# Apply migration locally
pnpm wrangler d1 migrations apply sec-rocks-d1 --local

# Verify schema
pnpm wrangler d1 execute sec-rocks-d1 --local --command "SELECT sql FROM sqlite_master WHERE name='notifications'"
```

#### Task 1.2: Data-Ops CRUD Helpers

**File**: `packages/data-ops/src/queries/notifications.ts`

```typescript
import { eq, and, desc, isNull, gt, sql } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { notifications } from '../schema/orchestration';
import { createId } from '@paralleldrive/cuid2';

export type NotificationType = 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE';
export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface CreateNotificationInput {
  organizationId: string;
  userId?: string | null;
  deviceId?: string | null;
  scanRunId?: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message?: string | null;
  data?: Record<string, any>;
  fingerprint?: string;
  suppressUntil?: Date;
}

/**
 * Create a new notification
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<typeof notifications.$inferSelect> {
  const db = getDb();

  const [notification] = await db
    .insert(notifications)
    .values({
      id: createId(),
      organizationId: input.organizationId,
      userId: input.userId || null,
      deviceId: input.deviceId || null,
      scanRunId: input.scanRunId || null,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message || null,
      data: input.data || null,
      fingerprint: input.fingerprint || null,
      suppressUntil: input.suppressUntil || null,
      readAt: null,
      emailSent: false,
      emailSentAt: null,
    })
    .returning();

  return notification;
}

/**
 * Get unread notifications for organization
 */
export async function getUnreadNotifications(
  organizationId: string,
  userId?: string | null,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<Array<typeof notifications.$inferSelect>> {
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, organizationId),
    isNull(notifications.readAt),
  ];

  if (userId) {
    conditions.push(eq(notifications.userId, userId));
  }

  const result = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  return result;
}

/**
 * Get unread count for bell badge
 */
export async function getUnreadNotificationCount(
  organizationId: string,
  userId?: string | null
): Promise<number> {
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, organizationId),
    isNull(notifications.readAt),
  ];

  if (userId) {
    conditions.push(eq(notifications.userId, userId));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(...conditions));

  return result?.count || 0;
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  organizationId: string
): Promise<void> {
  const db = getDb();

  await db
    .update(notifications)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, organizationId)
      )
    );
}

/**
 * Mark all notifications as read for organization
 */
export async function markAllNotificationsAsRead(
  organizationId: string,
  userId?: string | null
): Promise<void> {
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, organizationId),
    isNull(notifications.readAt),
  ];

  if (userId) {
    conditions.push(eq(notifications.userId, userId));
  }

  await db
    .update(notifications)
    .set({
      readAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}

/**
 * Check if notification should be suppressed based on fingerprint
 */
export async function isNotificationSuppressed(
  fingerprint: string,
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.fingerprint, fingerprint),
        gt(notifications.suppressUntil, now)
      )
    )
    .limit(1);

  return !!existing;
}

/**
 * Mark notification as email sent
 */
export async function markNotificationEmailSent(
  notificationId: string
): Promise<void> {
  const db = getDb();

  await db
    .update(notifications)
    .set({
      emailSent: true,
      emailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(notifications.id, notificationId));
}

/**
 * Get notifications for a specific device
 */
export async function getNotificationsForDevice(
  deviceId: string,
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<Array<typeof notifications.$inferSelect>> {
  const db = getDb();

  const result = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.deviceId, deviceId),
        eq(notifications.organizationId, organizationId)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit || 50)
    .offset(options?.offset || 0);

  return result;
}
```

**Export from index**:

Add to `packages/data-ops/src/index.ts`:
```typescript
export * from './queries/notifications';
```

**Unit Tests**: `packages/data-ops/src/queries/__tests__/notifications.test.ts`

#### Task 1.3: Change Detection Service

**File**: `apps/user-application/src/server/notifications/change-detector.ts`

See [Change Detection](#change-detection) section for full implementation.

**Unit Tests**: `apps/user-application/src/server/notifications/__tests__/change-detector.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { detectChanges, diffPorts } from '../change-detector';

describe('Change Detector', () => {
  describe('diffPorts', () => {
    it('should detect new open port', () => {
      const previous = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: 'http' },
        ],
      };

      const current = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: 'http' },
          { port: 22, protocol: 'tcp', state: 'open', service: 'ssh' },
        ],
      };

      const changes = diffPorts(current, previous, 'dev_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_PORT');
      expect(changes[0].data.port).toBe(22);
      expect(changes[0].fingerprint).toBe('new_port:dev_123:22:tcp');
    });

    it('should detect closed port', () => {
      const previous = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: 'http' },
          { port: 22, protocol: 'tcp', state: 'open', service: 'ssh' },
        ],
      };

      const current = {
        ports: [
          { port: 80, protocol: 'tcp', state: 'open', service: 'http' },
        ],
      };

      const changes = diffPorts(current, previous, 'dev_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('CLOSED_PORT');
      expect(changes[0].data.port).toBe(22);
    });

    it('should assign HIGH severity to RDP port', () => {
      const previous = { ports: [] };
      const current = {
        ports: [
          { port: 3389, protocol: 'tcp', state: 'open', service: 'ms-wbt-server' },
        ],
      };

      const changes = diffPorts(current, previous, 'dev_123');

      expect(changes[0].severity).toBe('HIGH');
    });
  });

  describe('diffCVEs', () => {
    it('should detect new critical CVE', () => {
      const previous = {
        cveEnrichment: {
          os: {
            cves: [
              { id: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 },
            ],
          },
        },
      };

      const current = {
        cveEnrichment: {
          os: {
            cves: [
              { id: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5 },
              { id: 'CVE-2024-5678', severity: 'CRITICAL', cvssScore: 9.8, description: 'RCE vulnerability' },
            ],
          },
        },
      };

      const changes = diffCVEs(current, previous, 'dev_123');

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_CVE');
      expect(changes[0].severity).toBe('CRITICAL');
      expect(changes[0].data.cveId).toBe('CVE-2024-5678');
    });
  });
});
```

---

### Week 2: In-App Delivery

**Goal**: UI components, server functions, real-time updates

#### Task 2.1: Server Functions

**File**: `apps/user-application/src/server/notifications.ts`

```typescript
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  getUnreadNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationsForDevice,
} from '@repo/data-ops';
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth';

/**
 * Get unread notifications for current user/org
 */
export const getNotificationsData = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({
    limit: z.number().optional(),
    offset: z.number().optional(),
  }).parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      const notifications = await getUnreadNotifications(
        organizationId,
        null, // MVP: org-wide notifications
        {
          limit: data.limit || 50,
          offset: data.offset || 0,
        }
      );

      return {
        success: true,
        notifications,
      };
    } catch (error) {
      return {
        success: false,
        notifications: [],
      };
    }
  });

/**
 * Get unread count for bell badge
 */
export const getUnreadCountData = createServerFn({
  method: 'POST',
}).handler(async () => {
  try {
    const organizationId = await getCurrentOrganizationId();

    const count = await getUnreadNotificationCount(organizationId);

    return {
      success: true,
      count,
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
    };
  }
});

/**
 * Mark notification as read
 */
export const markAsReadData = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({
    notificationId: z.string(),
  }).parse)
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      await markNotificationAsRead(data.notificationId, organizationId);

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  });

/**
 * Mark all as read
 */
export const markAllAsReadData = createServerFn({
  method: 'POST',
}).handler(async () => {
  try {
    const organizationId = await getCurrentOrganizationId();

    await markAllNotificationsAsRead(organizationId);

    return { success: true };
  } catch (error) {
    return { success: false };
  }
});
```

#### Task 2.2: TanStack Query Hooks

**File**: `apps/user-application/src/queries/notification-queries.ts`

```typescript
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getNotificationsData,
  getUnreadCountData,
  markAsReadData,
  markAllAsReadData,
} from '@/server/notifications';

/**
 * Query options for notifications
 */
export const notificationQueries = {
  /**
   * Unread notifications list
   */
  unread: (options?: { limit?: number; offset?: number }) =>
    queryOptions({
      queryKey: ['notifications', 'unread', options],
      queryFn: async () => {
        const result = await getNotificationsData({ data: options || {} });
        if (!result.success) {
          throw new Error('Failed to fetch notifications');
        }
        return result.notifications;
      },
      refetchInterval: 30000, // Poll every 30 seconds
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Unread count for badge
   */
  unreadCount: () =>
    queryOptions({
      queryKey: ['notifications', 'count'],
      queryFn: async () => {
        const result = await getUnreadCountData();
        if (!result.success) {
          throw new Error('Failed to fetch notification count');
        }
        return result.count;
      },
      refetchInterval: 30000, // Poll every 30 seconds
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),
};

/**
 * Mark notification as read
 */
export const useMarkAsReadMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      markAsReadData({ data: { notificationId } }),
    onSuccess: () => {
      // Invalidate queries to refresh list and count
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

/**
 * Mark all as read
 */
export const useMarkAllAsReadMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllAsReadData(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};
```

#### Task 2.3: UI Components

**Bell Icon Component**: `apps/user-application/src/components/notifications/notification-bell.tsx`

```typescript
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { notificationQueries } from '@/queries/notification-queries';
import { NotificationList } from './notification-list';

export function NotificationBell() {
  const { data: count } = useQuery(notificationQueries.unreadCount());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {count > 99 ? '99+' : count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Notification List**: `apps/user-application/src/components/notifications/notification-list.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { notificationQueries, useMarkAsReadMutation, useMarkAllAsReadMutation } from '@/queries/notification-queries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from '@tanstack/react-router';

export function NotificationList() {
  const { data: notifications, isLoading } = useQuery(
    notificationQueries.unread({ limit: 10 })
  );
  const markAsRead = useMarkAsReadMutation();
  const markAllAsRead = useMarkAllAsReadMutation();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!notifications || notifications.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No new notifications
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-background border-b px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-semibold">Notifications</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => markAllAsRead.mutate()}
          disabled={markAllAsRead.isPending}
        >
          <CheckCheck className="h-4 w-4 mr-1" />
          Mark all read
        </Button>
      </div>

      {/* Notification items */}
      <div className="divide-y">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => markAsRead.mutate(notification.id)}
          >
            <div className="flex items-start gap-3">
              <Badge
                variant={
                  notification.severity === 'CRITICAL'
                    ? 'destructive'
                    : notification.severity === 'HIGH'
                      ? 'default'
                      : 'secondary'
                }
                className="mt-1"
              >
                {notification.severity}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{notification.title}</p>
                {notification.message && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(notification.createdAt), 'MMM d, HH:mm')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t p-2 text-center">
        <Link
          to="/notifications"
          className="text-sm text-primary hover:underline"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
```

**Add to header**: Update `apps/user-application/src/routes/__root.tsx` to include bell icon in navigation.

---

### Week 3: Email + Polish

#### Task 3.1: Email Worker

**File**: `apps/user-application/src/server/notifications/email-worker.ts`

```typescript
import type { Env } from '../../worker-configuration';

interface EmailNotificationData {
  notificationId: string;
  organizationId: string;
  recipientEmail: string;
  severity: string;
  title: string;
  message?: string;
  data: any;
}

/**
 * Send notification email using Cloudflare Email binding
 *
 * Note: Email binding configured in wrangler.jsonc:
 * ```
 * "send_email": [
 *   {
 *     "name": "EMAIL",
 *     "destination_address": "notifications@sec.rocks"
 *   }
 * ]
 * ```
 */
export async function sendNotificationEmail(
  notification: EmailNotificationData,
  env: Env
): Promise<void> {
  // Get organization admin emails (future: respect user preferences)
  const recipientEmail = notification.recipientEmail;

  const subject = `[${notification.severity}] ${notification.title}`;

  const body = formatEmailBody(notification);

  try {
    await env.EMAIL.send({
      from: 'notifications@sec.rocks',
      to: recipientEmail,
      subject,
      text: body,
    });

    // Mark as sent in database
    const { markNotificationEmailSent } = await import('@repo/data-ops');
    await markNotificationEmailSent(notification.notificationId);
  } catch (error) {
    console.error('Failed to send notification email', {
      notificationId: notification.notificationId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't break notification creation
  }
}

/**
 * Format plain text email body
 */
function formatEmailBody(notification: EmailNotificationData): string {
  const lines: string[] = [];

  lines.push(`Security Alert: ${notification.severity}`);
  lines.push('');
  lines.push(notification.title);

  if (notification.message) {
    lines.push('');
    lines.push(notification.message);
  }

  // Add structured details
  if (notification.data) {
    lines.push('');
    lines.push('Details:');

    if (notification.data.port) {
      lines.push(`  Port: ${notification.data.port}/${notification.data.protocol}`);
    }

    if (notification.data.service) {
      lines.push(`  Service: ${notification.data.service}`);
    }

    if (notification.data.cveId) {
      lines.push(`  CVE: ${notification.data.cveId}`);
      lines.push(`  CVSS: ${notification.data.cvss}`);
    }

    if (notification.data.deviceName) {
      lines.push(`  Device: ${notification.data.deviceName}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('View full details: https://sec.rocks/notifications');
  lines.push('');
  lines.push('This is an automated security notification from sec.rocks');

  return lines.join('\n');
}
```

#### Task 3.2: Integration with Port Scan Handler

**File**: `apps/user-application/src/server/postback/handlers/port-scan.ts`

**Insert after line 201** (after persist logic):

```typescript
// Existing code...
await updateScanRunResultSummary(scanRunId, finalRun.resultSummary);

// ========== NEW: Change Detection & Notifications ==========

try {
  // Import services
  const { detectChanges } = await import('../../notifications/change-detector');
  const { getLastSuccessfulScanForDevice } = await import('@repo/data-ops');
  const { createNotification, isNotificationSuppressed } = await import('@repo/data-ops');
  const { sendNotificationEmail } = await import('../../notifications/email-worker');

  // Load baseline (previous successful scan)
  const previousScan = await getLastSuccessfulScanForDevice(
    payload.deviceId,
    organizationId,
    scanRunId // Exclude current scan
  );

  // Detect changes
  const changes = await detectChanges(finalRun, previousScan);

  // Filter and create notifications
  for (const change of changes) {
    // Check deduplication
    if (change.fingerprint) {
      const suppressed = await isNotificationSuppressed(
        change.fingerprint,
        organizationId
      );

      if (suppressed) {
        console.log('Notification suppressed', {
          fingerprint: change.fingerprint,
          type: change.type,
        });
        continue;
      }
    }

    // Calculate suppress window
    const suppressUntil = calculateSuppressUntil(change);

    // Create notification
    const notification = await createNotification({
      organizationId,
      deviceId: payload.deviceId,
      scanRunId,
      type: change.type,
      severity: change.severity,
      title: change.title,
      message: change.message,
      data: change.data,
      fingerprint: change.fingerprint,
      suppressUntil,
    });

    // Send email for CRITICAL/HIGH
    if (change.severity === 'CRITICAL' || change.severity === 'HIGH') {
      // Get org admin email (future: user preferences)
      const adminEmail = 'admin@example.com'; // TODO: fetch from org settings

      await sendNotificationEmail(
        {
          notificationId: notification.id,
          organizationId,
          recipientEmail: adminEmail,
          severity: notification.severity,
          title: notification.title,
          message: notification.message,
          data: notification.data,
        },
        ctx.env
      );
    }
  }

  console.log('Change detection complete', {
    scanRunId,
    changesDetected: changes.length,
  });
} catch (error) {
  // Log but don't fail the postback
  console.error('Change detection failed', {
    scanRunId,
    error: error instanceof Error ? error.message : String(error),
  });
}

// ========== END: Change Detection & Notifications ==========

// Existing code continues...
return {
  success: true,
  message: 'Port scan results processed successfully',
};

// Helper function
function calculateSuppressUntil(change: any): Date {
  const now = new Date();
  const durations: Record<string, number> = {
    NEW_PORT: 6 * 60 * 60 * 1000,
    CLOSED_PORT: 6 * 60 * 60 * 1000,
    NEW_CVE: 24 * 60 * 60 * 1000,
    CVE_SEVERITY_INCREASE: 24 * 60 * 60 * 1000,
  };

  const duration = durations[change.type] || 6 * 60 * 60 * 1000;
  return new Date(now.getTime() + duration);
}
```

#### Task 3.3: Integration Tests

**File**: `apps/user-application/src/server/postback/handlers/__tests__/notifications-integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { initDatabase, resetDatabase, getDb } from '@repo/data-ops/database/setup';
import { createNotification, getUnreadNotifications } from '@repo/data-ops';

describe('Notification Integration', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    // Setup Miniflare with local D1
    mf = new Miniflare({
      modules: true,
      script: '',
      d1Databases: {
        DB: '93d2bd33-3b3e-42f3-a982-39b790922949',
      },
      d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
    });

    const d1db = await mf.getD1Database('DB');
    initDatabase(d1db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('should create and retrieve notification', async () => {
    const notification = await createNotification({
      organizationId: 'org_test',
      deviceId: 'dev_test',
      type: 'NEW_PORT',
      severity: 'HIGH',
      title: 'Test notification',
      fingerprint: 'test_fingerprint',
    });

    expect(notification.id).toBeDefined();
    expect(notification.severity).toBe('HIGH');

    const unread = await getUnreadNotifications('org_test');
    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe(notification.id);
  });

  it('should suppress duplicate notifications', async () => {
    const fingerprint = 'duplicate_test';

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
    const { isNotificationSuppressed } = await import('@repo/data-ops');
    const suppressed = await isNotificationSuppressed(fingerprint, 'org_test');

    expect(suppressed).toBe(true);
  });
});
```

---

## API Reference

### Server Functions

#### `getNotificationsData`
- **Method**: POST
- **Input**: `{ limit?: number, offset?: number }`
- **Returns**: `{ success: boolean, notifications: Notification[] }`
- **Description**: Get unread notifications for current organization

#### `getUnreadCountData`
- **Method**: POST
- **Input**: None
- **Returns**: `{ success: boolean, count: number }`
- **Description**: Get count of unread notifications for badge

#### `markAsReadData`
- **Method**: POST
- **Input**: `{ notificationId: string }`
- **Returns**: `{ success: boolean }`
- **Description**: Mark single notification as read

#### `markAllAsReadData`
- **Method**: POST
- **Input**: None
- **Returns**: `{ success: boolean }`
- **Description**: Mark all notifications as read for organization

### Data-Ops Queries

#### `createNotification(input: CreateNotificationInput)`
Creates a new notification record.

#### `getUnreadNotifications(organizationId, userId?, options?)`
Fetches unread notifications with pagination.

#### `getUnreadNotificationCount(organizationId, userId?)`
Returns count for badge display.

#### `markNotificationAsRead(notificationId, organizationId)`
Marks single notification as read.

#### `markAllNotificationsAsRead(organizationId, userId?)`
Marks all unread as read.

#### `isNotificationSuppressed(fingerprint, organizationId)`
Checks if notification should be suppressed based on fingerprint + suppressUntil.

#### `getLastSuccessfulScanForDevice(deviceId, organizationId, beforeScanId?)`
Fetches baseline scan for change detection.

---

## Future Enhancements

### Phase 2: Advanced Features

1. **Digest Mode**
   - Daily/weekly email rollups of notifications
   - Group by device, severity, type
   - Scheduled via Cloudflare Cron Triggers

2. **User Preferences**
   - Per-user notification settings
   - Channel preferences (email, Slack, SMS)
   - Severity thresholds
   - Quiet hours (don't notify 10pm-8am)
   - Device watch list (only notify for specific devices)

3. **Webhook Integrations**
   - Slack incoming webhooks
   - Discord webhooks
   - Custom HTTP endpoints
   - PagerDuty integration

4. **Notification History**
   - Archive read notifications after 30 days
   - Notification timeline view
   - Diff viewer (show what changed)
   - Acknowledgment workflow (mark as "investigating", "resolved")

5. **Extended Change Detection**
   - Httpx artifact changes (tech stack updates)
   - Screenshot diffs (visual regression detection)
   - Discovery scan changes (new/removed assets)
   - Certificate expiration warnings

6. **Rate Limiting Enhancements**
   - Per-device daily caps
   - Auto-suppress noisy devices
   - Anomaly detection (unusual spike in changes)

7. **Analytics**
   - Notification metrics dashboard
   - MTTR (mean time to read/acknowledge)
   - Most common notification types
   - Device/org notification heatmap

---

## Open Questions

1. **Fingerprint suppress duration**
   - Current: 6h ports, 24h CVEs
   - Should this be configurable per-org?

2. **Closed port notifications**
   - Current: Notify for all closed ports (LOW severity)
   - Alternative: Only notify if port was tagged "critical"
   - Decision needed

3. **Email templates**
   - MVP: Plain text
   - Future: HTML with branding?

4. **Notification retention**
   - Current: Keep forever
   - Alternative: Auto-delete read after 30 days
   - Decision needed

5. **Organization vs user notifications**
   - MVP: All org-wide (userId = null)
   - Future: Target specific users based on device ownership?

6. **Real-time delivery**
   - MVP: 30-second polling
   - Future: WebSockets or Server-Sent Events?

---

## References

### Related Files

- Port scan handler: `apps/user-application/src/server/postback/handlers/port-scan.ts`
- Scan queries: `packages/data-ops/src/queries/scans.ts`
- Schema: `packages/data-ops/src/schema/orchestration.ts`
- Postback architecture: `docs/postback-architecture.md`

### External Resources

- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Drizzle ORM](https://orm.drizzle.team/)
- [CVSS Severity Ratings](https://nvd.nist.gov/vuln-metrics/cvss)

---

**Last Updated**: 2025-11-08
**Status**: Ready for implementation
**Next Action**: Create migration + data-ops queries (Week 1, Task 1.1)
