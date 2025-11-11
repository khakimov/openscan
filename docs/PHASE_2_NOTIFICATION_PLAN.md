# Phase 2: Notification System Hardening - Implementation Plan

**Epic**: `sec-erx`
**Status**: Planning Complete
**Priority**: P0
**Created**: 2025-11-09

---

## Overview

This document outlines the complete implementation plan for Phase 2 of the notification system. The plan improves notification reliability, deduplication, and messaging based on battle-tested patterns from the legacy footprint platform.

**Total Issues**: 26 tasks across 9 categories
**Estimated Effort**: 3-4 weeks
**Dependencies**: Phase 1 (MVP) complete ✅

---

## Table of Contents

1. [Priority Breakdown](#priority-breakdown)
2. [Database Safeguards](#database-safeguards)
3. [Notification Catalog & Metadata](#notification-catalog--metadata)
4. [Change Detection Enhancements](#change-detection-enhancements)
5. [Port Diff Refinements](#port-diff-refinements)
6. [CVE Diff Refinements](#cve-diff-refinements)
7. [Notification Creation API](#notification-creation-api)
8. [Read State & UI](#read-state--ui)
9. [Maintenance & Cleanup](#maintenance--cleanup)
10. [Testing & Observability](#testing--observability)
11. [Implementation Order](#implementation-order)

---

## Priority Breakdown

### P0 (Critical) - 1 task
- Epic tracking

### P1 (High Priority) - 8 tasks
**Database Layer**:
- `sec-z7r` - Partial unique index with suppressUntil filter
- `sec-sd0` - Add messageHash column for secondary deduplication
- `sec-t4z` - Implement INSERT...ON CONFLICT for atomic deduplication

**Code Quality**:
- `sec-or9` - Refactor change detector to use notification catalog
- `sec-g6o` - Build typed notification helper functions
- `sec-2wk` - Create upsertNotification helper with logging

**Testing**:
- `sec-8nf` - Add integration tests for full notification pipeline
- `sec-2av` - Test D1 transaction behavior with concurrent inserts

### P2 (Medium Priority) - 15 tasks
**Features**:
- `sec-xp0` - Add notification modules taxonomy
- `sec-zg2` - Extend resultSummary with per-port metadata
- `sec-8sh` - Add service drift notifications
- `sec-acw` - Add port closed notifications with context
- `sec-11n` - Include service/product/version in fingerprints
- `sec-5j6` - Add CVE remediation tips to catalog
- `sec-5gu` - Add CVE fix/regression notifications
- `sec-1y2` - Implement severity threshold gating for email
- `sec-ali` - Add message-builder utilities
- `sec-39q` - Add API serializers mirroring legacy
- `sec-hwu` - Implement batched deleteOldNotifications

**Code Quality**:
- `sec-nmq` - Centralize severity mapping
- `sec-e4s` - Add unit tests for notification catalog
- `sec-ibq` - Create test fixtures for notification scenarios
- `sec-z0y` - Add structured logging with [Notifications] prefix
- `sec-mml` - Validate org-wide vs per-user read state

### P3 (Low Priority) - 2 tasks
- `sec-9e1` - Add metrics/logging for suppressed notifications
- `sec-mlx` - Cache baseline scans (optimization)

---

## Database Safeguards

### `sec-z7r` - Partial Unique Index (P1)
**Goal**: Allow fingerprint reuse after suppress window expires

**Current State**:
```sql
-- Full unique index (current)
CREATE UNIQUE INDEX notifications_fingerprint_unique_idx
ON notifications (organization_id, fingerprint);
```

**Target State**:
```sql
-- Partial unique index (future)
CREATE UNIQUE INDEX notifications_fingerprint_active_idx
ON notifications (organization_id, fingerprint)
WHERE suppress_until > CURRENT_TIMESTAMP;
```

**Benefits**:
- Fingerprints can be reused after suppress window expires
- More efficient storage (old notifications don't block new ones)
- Maintains database-level safety for active suppressions

**Trade-offs**:
- Requires SQLite 3.15+ (verify D1 support)
- More complex migration (drop + recreate index)

**Estimated Effort**: 2 hours
**Files**: `packages/data-ops/migrations/*.sql`, schema validation
**References**: `docs/NOTIFICATIONS/design-decisions.md#full-unique-index-vs-partial-index`

---

### `sec-sd0` - Message Hash Column (P1)
**Goal**: Add secondary deduplication layer using message content hash

**Implementation**:
```typescript
// Schema addition
export const notifications = sqliteTable('notifications', {
  // ... existing fields
  fingerprint: text('fingerprint').notNull(),
  messageHash: text('message_hash'), // NEW: hash of rendered message
  // ... rest
});

// Populate messageHash on creation
function hashMessage(title: string, message?: string): string {
  const content = `${title}|${message || ''}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
```

**Benefits**:
- Protects against accidental fingerprint divergence
- Matches legacy `message_hashed` pattern
- Enables content-based deduplication alongside structural fingerprints

**Migration Strategy**:
1. Add nullable `message_hash` column
2. Backfill existing notifications (compute from title + message)
3. Make required in application code
4. Consider unique index on `(organizationId, messageHash)` (future)

**Estimated Effort**: 3 hours
**Files**: Schema, migration, `createNotifications` query
**References**: `docs/LEGACY_NOTIFICATIONS.md` (message_hashed pattern)

---

### `sec-t4z` - INSERT...ON CONFLICT (P1)
**Goal**: Replace transaction-based check-and-insert with Drizzle upsert

**Current Implementation** (Transaction-based):
```typescript
const notification = await db.transaction(async (tx) => {
  const [existing] = await tx.select().from(notifications).where(...);
  if (existing) return null;
  const [created] = await tx.insert(notifications).values(...).returning();
  return created;
});
```

**Target Implementation** (INSERT...ON CONFLICT):
```typescript
const [notification] = await db
  .insert(notifications)
  .values({
    id,
    organizationId,
    fingerprint,
    // ... rest
  })
  .onConflictDoUpdate({
    target: [notifications.organizationId, notifications.fingerprint],
    set: {
      suppressUntil: sql`EXCLUDED.suppress_until`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  })
  .returning();
```

**Benefits**:
- Single database round-trip (no read-then-write)
- Automatic handling by unique index
- More D1-compatible (leverages database-level constraints)
- Simpler code (no manual transaction management)

**Dependencies**: Requires `sec-z7r` (unique index) completed first

**Estimated Effort**: 4 hours (includes Drizzle API research + testing)
**Files**: `packages/data-ops/src/queries/notifications/crud.ts`
**References**: [Drizzle onConflictDoUpdate](https://orm.drizzle.team/docs/insert#on-conflict-do-update)

---

## Notification Catalog & Metadata

### `sec-or9` - Refactor Change Detector to Use Catalog (P1)
**Goal**: Remove inline message strings, centralize in catalog

**Current (Inline Strings)**:
```typescript
// change-detector.ts
changes.push({
  type: 'NEW_PORT',
  severity: determinePortSeverity(port.port),
  title: `New ${serviceName} on port ${port.port} discovered`, // ❌ Hardcoded
  message: getPortSecurityMessage(port), // ❌ Hardcoded
  // ...
});
```

**Target (Catalog Functions)**:
```typescript
// change-detector.ts
import { createNewPortNotification } from '@repo/data-ops/notifications/catalog';

const descriptor = createNewPortNotification({
  port: port.port,
  protocol: port.protocol,
  service: serviceName,
  version: port.version,
});

changes.push({
  organizationId,
  deviceId,
  scanRunId,
  ...descriptor, // ✅ Type: NotificationDescriptor
  data: { /* ... */ },
  fingerprint: `new_port:${deviceId}:${port.protocol}:${port.port}:${port.service?.product || serviceName}:${port.service?.version || 'unknown'}:${serviceName}`,
  suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
});
```

**Benefits**:
- Single source of truth for notification copy
- Easier to add i18n in the future
- Type-safe message construction
- Simpler unit testing (test catalog separately from diffing logic)

**Estimated Effort**: 4 hours
**Files**: `apps/user-application/src/server/notifications/change-detector.ts`, catalog integration
**References**: `packages/data-ops/src/notifications/catalog.ts`

---

### `sec-xp0` - Add Notification Modules Taxonomy (P2)
**Goal**: Introduce module grouping alongside type/severity

**Schema Changes**:
```typescript
export const notifications = sqliteTable('notifications', {
  // ... existing fields
  module: text('module').notNull(), // NEW: 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT' | 'COMPLIANCE'
  type: text('type').notNull(), // Existing: 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | ...
  severity: text('severity').notNull(), // Existing: 'CRITICAL' | 'HIGH' | ...
  // ... rest
});
```

**Catalog Updates**:
```typescript
// catalog.ts
export type NotificationModule =
  | 'NETWORK_SECURITY'      // Ports, services, firewall
  | 'VULNERABILITY_MANAGEMENT' // CVEs, patches
  | 'COMPLIANCE'            // Policy violations (future)
  | 'DISCOVERY';            // Asset changes (future)

export function createNewPortNotification(params: {...}): NotificationDescriptor {
  return {
    module: 'NETWORK_SECURITY', // ✅ NEW
    type: 'NEW_PORT',
    severity: PORT_SEVERITY_MAP[params.port] || 'LOW',
    // ... rest
  };
}
```

**Benefits**:
- UI can filter by module (e.g., "Show only vulnerability notifications")
- Mirrors legacy `Agents/Availability/Vulnerability` pattern
- Prepares for future notification types (compliance, discovery, etc.)

**Estimated Effort**: 3 hours
**Files**: Schema, catalog, migration
**References**: `docs/LEGACY_NOTIFICATIONS.md#soft-catalog-of-modules`

---

### `sec-e4s` - Unit Tests for Notification Catalog (P2)
**Goal**: Test catalog functions produce expected outputs

**Test Coverage**:
```typescript
// packages/data-ops/src/notifications/__tests__/catalog.test.ts
describe('Notification Catalog', () => {
  describe('createNewPortNotification', () => {
    it('should create HIGH severity for RDP port', () => {
      const descriptor = createNewPortNotification({
        port: 3389,
        protocol: 'tcp',
        service: 'ms-wbt-server',
      });

      expect(descriptor.type).toBe('NEW_PORT');
      expect(descriptor.severity).toBe('HIGH');
      expect(descriptor.title).toContain('3389');
      expect(descriptor.message).toContain('RDP');
    });

    it('should create MEDIUM severity for SSH port', () => {
      const descriptor = createNewPortNotification({
        port: 22,
        protocol: 'tcp',
        service: 'ssh',
      });

      expect(descriptor.severity).toBe('MEDIUM');
    });

    it('should create LOW severity for unknown port', () => {
      const descriptor = createNewPortNotification({
        port: 9999,
        protocol: 'tcp',
      });

      expect(descriptor.severity).toBe('LOW');
      expect(descriptor.message).toContain('Review security configuration');
    });
  });

  describe('createNewCVENotification', () => {
    it('should map CRITICAL CVE severity correctly', () => {
      const descriptor = createNewCVENotification({
        cveId: 'CVE-2024-1234',
        severity: 'CRITICAL',
        cvssScore: 9.8,
        description: 'RCE vulnerability',
      });

      expect(descriptor.severity).toBe('CRITICAL');
      expect(descriptor.title).toContain('CVE-2024-1234');
    });
  });

  // ... more tests
});
```

**Estimated Effort**: 2 hours
**Files**: New test file
**Dependencies**: Requires `sec-or9` completed first

---

## Change Detection Enhancements

### `sec-zg2` - Extend resultSummary with Per-Port Metadata (P2)
**Goal**: Store service/product/version for richer change detection

**Current Schema**:
```typescript
// resultSummary.ports array
{
  port: 22,
  protocol: 'tcp',
  state: 'open',
  service: 'ssh' // ❌ Sometimes string, sometimes object
}
```

**Target Schema**:
```typescript
// Normalized port metadata
{
  port: 22,
  protocol: 'tcp',
  state: 'open',
  service: {
    name: 'ssh',        // ✅ Always structured
    product: 'OpenSSH', // ✅ Product name
    version: '9.3p1',   // ✅ Version string
    cpe: 'cpe:/a:openbsd:openssh:9.3p1' // ✅ Optional CPE
  }
}
```

**Benefits**:
- Enables service drift detection (product/version changes)
- Mirrors legacy `Daemon.compare_parameters` pattern
- Richer fingerprints (include product/version)
- Better CVE correlation (match CPE strings)

**Implementation Notes**:
- Update `buildResultSummary()` in port-scan handler
- Normalize nmap output to structured format
- Add validation schema for service metadata
- Backfill existing scans? (probably not - only new scans)

**Estimated Effort**: 4 hours
**Files**: `apps/user-application/src/server/postback/handlers/port-scan.ts`, result summary builder
**References**: `docs/LEGACY_NOTIFICATIONS.md` Daemon.compare_parameters

---

### `sec-mlx` - Cache Baseline Scans (P3)
**Goal**: Optimize change detection performance by caching previous baseline

**Current Flow**:
```typescript
// Every scan re-fetches and parses baseline
const baseline = await getLastSuccessfulScanForDevice({...}); // ❌ DB query + JSON parse
const changes = await detectScanChanges({ currentScan, baseline });
```

**Target Flow**:
```typescript
// Cache baseline in Redis/D1 table
const cacheKey = `baseline:${deviceId}`;
let baseline = await cache.get(cacheKey);

if (!baseline) {
  baseline = await getLastSuccessfulScanForDevice({...});
  await cache.set(cacheKey, baseline, { ttl: 3600 }); // 1 hour
}

const changes = await detectScanChanges({ currentScan, baseline });
```

**Cache Invalidation**:
- Invalidate on new successful scan
- TTL fallback (1 hour)

**Benefits**:
- Faster change detection (no JSON parsing)
- Reduced database load
- Better performance for high-frequency scans

**Trade-offs**:
- Adds Redis dependency (or D1 cache table)
- Cache invalidation complexity
- Low ROI for MVP (optimize later)

**Estimated Effort**: 4 hours (if using D1 table), 6 hours (if adding Redis)
**Priority**: P3 (low priority optimization)

---

## Port Diff Refinements

### `sec-8sh` - Add Service Drift Notifications (P2)
**Goal**: Detect and notify when service name/version changes on existing port

**Implementation**:
```typescript
// change-detector.ts - diffPorts()
for (const [key, currPort] of currPortMap) {
  const prevPort = prevPortMap.get(key);

  if (prevPort && currPort.state === 'open' && prevPort.state === 'open') {
    // Both ports open - check for service changes
    const serviceChanged = (
      currPort.service?.product !== prevPort.service?.product ||
      currPort.service?.version !== prevPort.service?.version
    );

    if (serviceChanged) {
      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        type: 'SERVICE_DRIFT', // ✅ NEW notification type
        severity: 'MEDIUM',
        title: `Service change on port ${currPort.port}`,
        message: `${prevPort.service?.product} ${prevPort.service?.version} → ${currPort.service?.product} ${currPort.service?.version}`,
        data: {
          port: currPort.port,
          previousService: prevPort.service,
          currentService: currPort.service,
        },
        fingerprint: `service_drift:${deviceId}:${currPort.port}:${currPort.protocol}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
      });
    }
  }
}
```

**Benefits**:
- Detect software updates/downgrades
- Catch unauthorized service changes
- Mirrors legacy `Daemon.compare_parameters` pattern

**Dependencies**: Requires `sec-zg2` (per-port metadata) completed first

**Estimated Effort**: 3 hours
**Files**: `change-detector.ts`, catalog (add SERVICE_DRIFT builder)

---

### `sec-acw` - Port Closed Notifications with Context (P2)
**Goal**: Add security context to CLOSED_PORT notifications

**Current Implementation**:
```typescript
// change-detector.ts
changes.push({
  type: 'CLOSED_PORT',
  severity: 'INFO', // ❌ Always INFO
  title: `Port ${prevPort.port} (${serviceName}) is now closed`,
  message: undefined, // ❌ No context
  // ...
});
```

**Enhanced Implementation**:
```typescript
changes.push({
  type: 'CLOSED_PORT',
  severity: determineClosedPortSeverity(prevPort), // ✅ Context-aware
  title: `${serviceName} on port ${prevPort.port} is now closed`,
  message: getClosedPortContext(prevPort), // ✅ Remediation context
  data: {
    port: prevPort.port,
    protocol: prevPort.protocol,
    service: serviceName,
    previousState: prevPort.state,
    wasHighRisk: PORT_SEVERITY_MAP[prevPort.port] === 'HIGH', // ✅ Flag high-risk closures
  },
  // ...
});

function getClosedPortContext(port: any): string {
  const isHighRisk = PORT_SEVERITY_MAP[port.port] === 'HIGH';

  if (isHighRisk) {
    return `Good news: High-risk ${port.service?.name || 'service'} is no longer exposed. Verify this was intentional.`;
  }

  return `Port ${port.port} is no longer accessible. If this was unexpected, investigate immediately.`;
}
```

**Benefits**:
- Helps users distinguish intentional vs accidental closures
- Provides remediation guidance
- Celebrates security wins (high-risk port closed)

**Estimated Effort**: 2 hours
**Files**: `change-detector.ts:395`, catalog

---

### `sec-11n` - Include Service Metadata in Fingerprints (P2)
**Goal**: Enhance fingerprints to include service/product/version

**Current Fingerprint**:
```typescript
fingerprint: `new_port:${deviceId}:${port.port}:${port.protocol}` // ❌ Port + protocol only
```

**Enhanced Fingerprint**:
```typescript
fingerprint: `new_port:${deviceId}:${port.protocol}:${port.port}:${port.service?.product || 'unknown'}:${port.service?.version || 'unknown'}:${port.service?.name || port.service?.product || 'unknown'}`
// ✅ Includes product + version + name (prevents false deduplication)
```

**Benefits**:
- Better deduplication (SSH 9.3 vs 9.4 are different events)
- Supports service drift detection
- More granular suppress windows

**Trade-offs**:
- Longer fingerprint strings
- More notifications (version changes trigger new notifications)
- May need tuning based on user feedback

**Dependencies**: Requires `sec-zg2` (per-port metadata) completed first

**Estimated Effort**: 2 hours
**Files**: `change-detector.ts:389` fingerprint generation

---

## CVE Diff Refinements

### `sec-5j6` - Add CVE Remediation Tips (P2)
**Goal**: Make CVE notifications actionable with remediation guidance

**Current Catalog**:
```typescript
export function createNewCVENotification(params: {...}): NotificationDescriptor {
  return {
    type: 'NEW_CVE',
    severity: mapCVESeverityToNotificationSeverity(params.severity),
    title: `New ${params.severity} vulnerability ${params.cveId} discovered`,
    message: `${params.cveId} (CVSS ${params.cvssScore}): ${params.description}`, // ❌ No remediation
  };
}
```

**Enhanced Catalog**:
```typescript
export function createNewCVENotification(params: {
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  remediation?: string; // ✅ NEW
  patchAvailable?: boolean; // ✅ NEW
}): NotificationDescriptor {
  const remediationText = params.remediation || generateDefaultRemediation(params);

  return {
    type: 'NEW_CVE',
    severity: mapCVESeverityToNotificationSeverity(params.severity),
    title: `New ${params.severity} vulnerability ${params.cveId} discovered`,
    message: `
${params.cveId} (CVSS ${params.cvssScore})
Affected: ${params.affectedService || 'Unknown service'}

Description: ${params.description}

Remediation: ${remediationText}
${params.patchAvailable ? '✅ Patch available - update immediately' : '⚠️ No patch available yet - implement mitigations'}
    `.trim(),
  };
}

function generateDefaultRemediation(params: any): string {
  if (params.patchAvailable) {
    return `Update ${params.affectedService} to the latest patched version.`;
  }

  return `Implement compensating controls: restrict network access, enable additional monitoring, follow vendor advisories.`;
}
```

**Data Sources**:
- Necto API response (if available)
- NVD API (fallback)
- Hardcoded common CVE patterns (OpenSSL, SMB, etc.)

**Estimated Effort**: 4 hours
**Files**: Catalog, CVE enrichment integration

---

### `sec-5gu` - Add CVE Fix/Regression Notifications (P2)
**Goal**: Notify when CVE is fixed or regresses

**New Notification Types**:
```typescript
// catalog.ts
export type NotificationType =
  | 'NEW_PORT'
  | 'CLOSED_PORT'
  | 'NEW_CVE'
  | 'CVE_SEVERITY_INCREASE'
  | 'CVE_FIXED'        // ✅ NEW - CVE no longer present
  | 'CVE_REGRESSED';   // ✅ NEW - CVE returned after being fixed
```

**Change Detector Logic**:
```typescript
// diffCVEs()
for (const [cveId, prevCVE] of prevCVEMap) {
  if (!currCVEMap.has(cveId)) {
    // CVE was present, now gone = FIXED
    changes.push({
      type: 'CVE_FIXED',
      severity: 'INFO',
      title: `Vulnerability ${cveId} has been resolved`,
      message: `${prevCVE.severity} vulnerability ${cveId} is no longer detected. Likely patched or service updated.`,
      data: {
        cveId,
        previousSeverity: prevCVE.severity,
        previousCvss: prevCVE.cvssScore,
      },
      fingerprint: `cve_fixed:${deviceId}:${cveId}`,
      suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }
}

// Check for regressions (was fixed, now back)
// Requires tracking CVE history (out of scope for MVP - store in data field?)
```

**Benefits**:
- Celebrates security wins (CVE fixed)
- Alerts to regressions (CVE returned)
- Mirrors legacy `critical_fix`/`critical_unfix` pattern

**Complexity**:
- Need CVE history tracking to detect regressions
- Consider separate `cve_history` table or store in notification data

**Estimated Effort**: 4 hours
**Files**: `change-detector.ts`, catalog

---

### `sec-1y2` - Severity Threshold Gating for Email (P2)
**Goal**: Make email notification thresholds configurable

**Current (Hardcoded)**:
```typescript
// port-scan.ts
if (change.severity === 'CRITICAL' || change.severity === 'HIGH') {
  await sendNotificationEmail(...); // ❌ Hardcoded threshold
}
```

**Target (Configurable)**:
```typescript
// org_settings table
export const orgSettings = sqliteTable('org_settings', {
  organizationId: text('organization_id').primaryKey(),
  emailNotificationThreshold: text('email_notification_threshold')
    .notNull()
    .default('HIGH'), // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'
  // ... other settings
});

// port-scan.ts
const orgSettings = await getOrganizationSettings(organizationId);

if (getSeverityOrder(change.severity) >= getSeverityOrder(orgSettings.emailNotificationThreshold)) {
  await sendNotificationEmail(...); // ✅ Configurable
}
```

**UI Addition**:
- Organization settings page
- Dropdown: "Email me for notifications: CRITICAL only | HIGH and above | MEDIUM and above | All"

**Estimated Effort**: 3 hours
**Files**: Schema, settings queries, port-scan handler, UI settings page

---

## Notification Creation API

### `sec-g6o` - Build Typed Notification Helpers (P1)
**Goal**: Create typed helpers that wrap catalog + database writes

**Implementation**:
```typescript
// packages/data-ops/src/notifications/helpers.ts
import { createNewPortNotification } from './catalog';
import { createNotifications } from '../queries/notifications';

export async function notifyNewPort(params: {
  organizationId: string;
  deviceId: string;
  scanRunId: string;
  port: number;
  protocol: string;
  service?: string;
  version?: string;
}): Promise<void> {
  // 1. Get descriptor from catalog
  const descriptor = createNewPortNotification({
    port: params.port,
    protocol: params.protocol,
    service: params.service,
    version: params.version,
  });

  // 2. Build full notification input
  const product = params.service ?? 'unknown';
  const version = params.version ?? 'unknown';
  const name = params.service ?? 'unknown';

  const input: CreateNotificationInput = {
    organizationId: params.organizationId,
    deviceId: params.deviceId,
    scanRunId: params.scanRunId,
    ...descriptor,
    data: {
      port: params.port,
      protocol: params.protocol,
      service: params.service,
      version: params.version,
    },
    fingerprint: `new_port:${params.deviceId}:${params.protocol}:${params.port}:${product}:${version}:${name}`,
    suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
  };

  // 3. Persist (with automatic deduplication)
  await createNotifications([input]);
}

// Similar helpers for other notification types
export async function notifyNewCVE(params: {...}): Promise<void> { ... }
export async function notifyClosedPort(params: {...}): Promise<void> { ... }
export async function notifyCVESeverityIncrease(params: {...}): Promise<void> { ... }
```

**Usage in Change Detector**:
```typescript
// change-detector.ts (refactored)
import { notifyNewPort, notifyNewCVE } from '@repo/data-ops/notifications/helpers';

// Instead of building change objects, call helpers directly
for (const [key, port] of currPortMap) {
  if (isNowOpen && !wasOpen) {
    await notifyNewPort({
      organizationId,
      deviceId,
      scanRunId,
      port: port.port,
      protocol: port.protocol,
      service: port.service?.name,
      version: port.service?.version,
    }); // ✅ One call does everything
  }
}
```

**Benefits**:
- Type-safe notification creation
- Single entry point (catalog + database)
- Mirrors legacy `Notification.new_device()` pattern
- Easier to test (mock helpers instead of DB)

**Dependencies**: Requires `sec-or9` (catalog refactor) completed first

**Estimated Effort**: 4 hours
**Files**: New helpers module, refactor change detector

---

### `sec-2wk` - Create upsertNotification Helper (P1)
**Goal**: Wrap INSERT...ON CONFLICT with logging and error handling

**Implementation**:
```typescript
// packages/data-ops/src/queries/notifications/
export async function upsertNotification(
  input: CreateNotificationInput
): Promise<typeof notifications.$inferSelect | null> {
  const db = getDb();

  try {
    const [notification] = await db
      .insert(notifications)
      .values({
        id: createId(),
        organizationId: input.organizationId,
        // ... all fields
      })
      .onConflictDoUpdate({
        target: [notifications.organizationId, notifications.fingerprint],
        set: {
          suppressUntil: sql`EXCLUDED.suppress_until`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();

    // Log creation
    console.log(`[Notifications] Created: ${notification.type} (${notification.severity}) - ${notification.title}`);

    return notification;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Suppressed by unique index
      console.log(`[Notifications] Suppressed duplicate: ${input.fingerprint}`);
      return null;
    }

    // Log error
    console.error(`[Notifications] Failed to create notification`, {
      fingerprint: input.fingerprint,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

**Benefits**:
- Consistent logging for all notification creation
- Centralized error handling
- Easy to add metrics/observability later
- Single place to update dedupe logic

**Dependencies**: Requires `sec-t4z` (INSERT...ON CONFLICT) completed first

**Estimated Effort**: 3 hours
**Files**: `packages/data-ops/src/queries/notifications/`

---

### `sec-nmq` - Centralize Severity Mapping (P2)
**Goal**: Move severity logic into catalog module

**Current (Scattered)**:
```typescript
// change-detector.ts
function determinePortSeverity(port: number): NotificationSeverity {
  if ([23, 3389, 445].includes(port)) return 'HIGH';
  if ([22, 1433, 3306, 5432, 6379, 27017].includes(port)) return 'MEDIUM';
  return 'LOW';
}
```

**Target (Centralized)**:
```typescript
// catalog.ts (already exists)
export const PORT_SEVERITY_MAP: Record<number, NotificationSeverity> = {
  22: 'MEDIUM',
  23: 'HIGH',
  3389: 'HIGH',
  // ... complete map
};

export function getPortSeverity(port: number): NotificationSeverity {
  return PORT_SEVERITY_MAP[port] || 'LOW';
}

export function getCVESeverity(cveSeverity: string): NotificationSeverity {
  return mapCVESeverityToNotificationSeverity(cveSeverity);
}
```

**Refactor Usage**:
```typescript
// change-detector.ts
import { getPortSeverity } from '@repo/data-ops/notifications/catalog';

const severity = getPortSeverity(port.port); // ✅ Use catalog
```

**Dependencies**: Requires `sec-or9` (catalog refactor) completed first

**Estimated Effort**: 2 hours
**Files**: Catalog, change detector

---

### `sec-ali` - Add Message Builder Utilities (P2)
**Goal**: Create declarative utilities for message construction

**Implementation**:
```typescript
// catalog.ts
export function buildPortMessage(params: {
  port: number;
  protocol: string;
  service?: string;
  action: 'opened' | 'closed' | 'changed';
}): string {
  const serviceName = params.service || 'service';
  const securityMessage = PORT_SECURITY_MESSAGES[params.port];

  if (params.action === 'opened') {
    return securityMessage || `New service detected on port ${params.port}. Review security configuration.`;
  }

  if (params.action === 'closed') {
    return `Port ${params.port}/${params.protocol} (${serviceName}) is no longer accessible.`;
  }

  return `Service ${serviceName} on port ${params.port} has changed.`;
}

export function buildCVEMessage(params: {
  cveId: string;
  cvssScore: number;
  severity: string;
  description?: string;
  remediation?: string;
}): string {
  const parts = [
    `${params.cveId} (CVSS ${params.cvssScore})`,
    params.description,
    params.remediation ? `Remediation: ${params.remediation}` : null,
  ].filter(Boolean);

  return parts.join('\n\n');
}
```

**Benefits**:
- Keep catalog entries declarative (just metadata)
- Reusable message construction logic
- Easier to test message formatting separately

**Dependencies**: Requires `sec-or9` (catalog refactor) completed first

**Estimated Effort**: 2 hours
**Files**: Catalog module

---

## Read State & UI

### `sec-mml` - Validate Org-Wide Read State (P2)
**Goal**: Confirm current org-wide approach meets product requirements

**Questions to Answer**:
1. Is org-wide "mark all as read" the correct behavior?
2. Do users expect per-user read state?
3. How does this affect multi-user organizations?

**If Per-User State Needed**:
```typescript
// Schema addition
export const userNotificationReads = sqliteTable('user_notification_reads', {
  userId: text('user_id').notNull().references(() => auth_user.id),
  notificationId: text('notification_id').notNull().references(() => notifications.id),
  readAt: integer('read_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.notificationId] }),
}));

// Query changes
export async function getUnreadNotifications(params: {
  organizationId: string;
  userId: string; // ✅ Now required
}): Promise<Notification[]> {
  const db = getDb();

  return await db
    .select()
    .from(notifications)
    .leftJoin(
      userNotificationReads,
      and(
        eq(userNotificationReads.notificationId, notifications.id),
        eq(userNotificationReads.userId, params.userId)
      )
    )
    .where(
      and(
        eq(notifications.organizationId, params.organizationId),
        isNull(userNotificationReads.readAt) // ✅ Per-user filter
      )
    );
}
```

**Estimated Effort**: 4 hours (if per-user tracking needed), 1 hour (if validation only)
**Files**: Documentation, schema (if per-user), queries (if per-user)
**References**: `docs/NOTIFICATIONS/design-decisions.md#org-wide-vs-user-scoped-read-state`

---

### `sec-39q` - Add API Serializers (P2)
**Goal**: Consistent notification payload across clients (web, CLI, API)

**Implementation**:
```typescript
// packages/data-ops/src/notifications/serializers.ts
export interface NotificationResponse {
  id: string;
  refId: string; // Device ID or scan run ID
  priority: number; // Map severity to 0-100
  module: string; // 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT'
  type: string; // 'NEW_PORT' | 'NEW_CVE' | ...
  severity: string; // 'CRITICAL' | 'HIGH' | ...
  message: string; // Combined title + message
  timestamp: string; // ISO 8601
  read: boolean;
  data: Record<string, any>; // Original data field
}

export function serializeNotification(
  notification: typeof notifications.$inferSelect
): NotificationResponse {
  return {
    id: notification.id,
    refId: notification.deviceId || notification.scanRunId || notification.organizationId,
    priority: mapSeverityToPriority(notification.severity),
    module: notification.module || inferModule(notification.type),
    type: notification.type,
    severity: notification.severity,
    message: formatMessage(notification.title, notification.message),
    timestamp: notification.createdAt.toISOString(),
    read: !!notification.readAt,
    data: notification.data || {},
  };
}

function mapSeverityToPriority(severity: string): number {
  const map: Record<string, number> = {
    CRITICAL: 100,
    HIGH: 75,
    MEDIUM: 50,
    LOW: 25,
    INFO: 10,
  };
  return map[severity] || 0;
}
```

**Usage**:
```typescript
// apps/user-application/src/server/notifications.ts
export const getNotificationsData = createServerFn({...})
  .handler(async ({ data }) => {
    const notifications = await getNotifications(params);

    return {
      success: true,
      items: notifications.items.map(serializeNotification), // ✅ Consistent format
      total: notifications.total,
    };
  });
```

**Benefits**:
- Consistent payload across all clients
- Mirrors legacy `convert_notifications` pattern
- Easy to version API responses (v1, v2)

**Estimated Effort**: 3 hours
**Files**: New serializers module, update server functions
**References**: `docs/LEGACY_NOTIFICATIONS.md#data-shaping-ahead-of-the-ui`

---

## Maintenance & Cleanup

### `sec-hwu` - Batched deleteOldNotifications (P2)
**Goal**: Delete old notifications in batches to avoid locks

**Current (Naive)**:
```typescript
// Delete all at once (can lock table)
await db.delete(notifications).where(
  and(
    eq(notifications.organizationId, organizationId),
    lt(notifications.createdAt, new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)),
    isNotNull(notifications.readAt) // Only delete read notifications
  )
);
```

**Enhanced (Batched)**:
```typescript
// packages/data-ops/src/queries/notifications/
export async function deleteOldNotifications(
  organizationId: string,
  daysOld: number = 90,
  batchSize: number = 1000
): Promise<number> {
  const db = getDb();
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  while (true) {
    // Get batch of IDs to delete
    const batch = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          lt(notifications.createdAt, cutoffDate),
          isNotNull(notifications.readAt)
        )
      )
      .limit(batchSize);

    if (batch.length === 0) break;

    // Delete batch
    await db
      .delete(notifications)
      .where(inArray(notifications.id, batch.map(n => n.id)));

    totalDeleted += batch.length;

    // Log progress
    console.log(`[Notifications] Deleted batch of ${batch.length} old notifications (total: ${totalDeleted})`);

    // Optional: sleep between batches to reduce load
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return totalDeleted;
}
```

**Scheduling**:
```typescript
// Cloudflare Cron Trigger (wrangler.jsonc)
{
  "triggers": {
    "crons": ["0 2 * * *"] // Run daily at 2 AM
  }
}

// Worker handler
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const orgs = await getAllOrganizations();

    for (const org of orgs) {
      const deleted = await deleteOldNotifications(org.id, 90);
      console.log(`[Cleanup] Deleted ${deleted} old notifications for org ${org.id}`);
    }
  }
};
```

**Benefits**:
- Avoids long table locks
- Graceful degradation (partial progress)
- Monitoring-friendly (batch logs)
- Mirrors legacy chunked delete pattern

**Estimated Effort**: 3 hours
**Files**: `packages/data-ops/src/queries/notifications/`, worker cron handler
**References**: `docs/LEGACY_NOTIFICATIONS.md#table-maintenance`

---

### `sec-9e1` - Add Metrics for Suppressed Notifications (P3)
**Goal**: Track deduplication performance and excessive suppression

**Implementation**:
```typescript
// packages/data-ops/src/queries/notifications/
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<{
  created: Array<typeof notifications.$inferSelect>;
  suppressed: number;
  errors: number;
}> {
  const db = getDb();
  const created: Array<typeof notifications.$inferSelect> = [];
  let suppressed = 0;
  let errors = 0;

  for (const input of inputs) {
    try {
      const notification = await db.transaction(async (tx) => {
        // ... existing logic
        if (existing) {
          suppressed++; // ✅ Track suppressions
          return null;
        }
        // ... insert
      });

      if (notification) {
        created.push(notification);
      }
    } catch (error) {
      errors++; // ✅ Track errors
      console.error(`[Notifications] Failed to create notification`, {...});
    }
  }

  // ✅ Log summary
  console.log(`[Notifications] Batch complete: ${created.length} created, ${suppressed} suppressed, ${errors} errors`);

  // ✅ Optional: Send to analytics
  if (suppressed > 10) {
    console.warn(`[Notifications] High suppression rate: ${suppressed}/${inputs.length} (${(suppressed / inputs.length * 100).toFixed(1)}%)`);
  }

  return { created, suppressed, errors };
}
```

**Monitoring Queries**:
```sql
-- Suppression rate over time
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_notifications,
  SUM(CASE WHEN suppress_until > CURRENT_TIMESTAMP THEN 1 ELSE 0 END) as active_suppressions
FROM notifications
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

**Estimated Effort**: 2 hours
**Files**: `packages/data-ops/src/queries/notifications/`
**Priority**: P3 (nice to have, not critical)

---

## Testing & Observability

### `sec-8nf` - Integration Tests for Full Pipeline (P1)
**Goal**: Test end-to-end notification flow

**Test Scenarios**:
```typescript
// apps/user-application/src/server/__tests__/notifications-integration.test.ts
describe('Notification Pipeline Integration', () => {
  it('should create notification for new open port', async () => {
    // 1. Setup: Create baseline scan (port 22 only)
    const baseline = await createScanRun({
      deviceId: 'dev_test',
      organizationId: 'org_test',
      status: 'SUCCEEDED',
      resultSummary: {
        ports: [
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } }
        ],
      },
    });

    // 2. Simulate new scan (port 22 + 3389)
    const newScan = {
      ...baseline,
      id: 'run_new',
      resultSummary: {
        ports: [
          { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh' } },
          { port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server' } },
        ],
      },
    };

    // 3. Trigger change detection
    const changes = await detectScanChanges({
      deviceId: 'dev_test',
      currentScan: newScan,
      organizationId: 'org_test',
    });

    // 4. Verify change detected
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('NEW_PORT');
    expect(changes[0].data.port).toBe(3389);

    // 5. Create notifications
    const notifications = await createNotifications(changes);

    // 6. Verify notification stored
    expect(notifications.created).toHaveLength(1);
    expect(notifications.created[0].severity).toBe('HIGH'); // RDP is high-risk

    // 7. Verify API returns notification
    const apiResponse = await getNotifications({
      organizationId: 'org_test',
      userId: 'user_test',
      unreadOnly: true,
    });

    expect(apiResponse.items).toHaveLength(1);
    expect(apiResponse.items[0].title).toContain('3389');
  });

  it('should suppress duplicate notifications within suppress window', async () => {
    // ... test suppression logic
  });

  it('should create notification for new critical CVE', async () => {
    // ... test CVE detection
  });

  it('should create notification for CVE severity increase', async () => {
    // ... test CVE severity upgrade
  });

  it('should create notification for service drift', async () => {
    // ... test service version change
  });
});
```

**Coverage Goals**:
- ✅ New port detection
- ✅ Closed port detection
- ✅ Service drift detection
- ✅ New CVE detection
- ✅ CVE severity upgrade
- ✅ CVE fix detection
- ✅ Deduplication (suppress window)
- ✅ Unique index enforcement

**Estimated Effort**: 6 hours
**Files**: New integration test file

---

### `sec-ibq` - Create Test Fixtures (P2)
**Goal**: Seed realistic test data for all notification scenarios

**Fixtures**:
```typescript
// apps/user-application/src/server/__tests__/fixtures/scans.ts
export const BASELINE_SCAN = {
  id: 'run_baseline',
  deviceId: 'dev_test',
  organizationId: 'org_test',
  status: 'SUCCEEDED',
  resultSummary: {
    ports: [
      { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh', product: 'OpenSSH', version: '9.3p1' } },
      { port: 80, protocol: 'tcp', state: 'open', service: { name: 'http', product: 'nginx', version: '1.24.0' } },
    ],
    cveEnrichment: {
      os: {
        product: 'Ubuntu 22.04',
        cves: [
          { cveId: 'CVE-2023-1234', severity: 'MEDIUM', cvssScore: 5.5, description: 'Test CVE' }
        ],
      },
    },
  },
};

export const SCAN_WITH_NEW_PORT = {
  ...BASELINE_SCAN,
  id: 'run_new_port',
  resultSummary: {
    ...BASELINE_SCAN.resultSummary,
    ports: [
      ...BASELINE_SCAN.resultSummary.ports,
      { port: 3389, protocol: 'tcp', state: 'open', service: { name: 'ms-wbt-server', product: 'RDP', version: '10.0' } },
    ],
  },
};

export const SCAN_WITH_CLOSED_PORT = {
  ...BASELINE_SCAN,
  id: 'run_closed_port',
  resultSummary: {
    ...BASELINE_SCAN.resultSummary,
    ports: [
      { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh', product: 'OpenSSH', version: '9.3p1' } },
      // Port 80 removed (closed)
    ],
  },
};

export const SCAN_WITH_SERVICE_DRIFT = {
  ...BASELINE_SCAN,
  id: 'run_service_drift',
  resultSummary: {
    ...BASELINE_SCAN.resultSummary,
    ports: [
      { port: 22, protocol: 'tcp', state: 'open', service: { name: 'ssh', product: 'OpenSSH', version: '9.4p1' } }, // Version changed
      { port: 80, protocol: 'tcp', state: 'open', service: { name: 'http', product: 'nginx', version: '1.24.0' } },
    ],
  },
};

export const SCAN_WITH_NEW_CVE = {
  ...BASELINE_SCAN,
  id: 'run_new_cve',
  resultSummary: {
    ...BASELINE_SCAN.resultSummary,
    cveEnrichment: {
      os: {
        product: 'Ubuntu 22.04',
        cves: [
          ...BASELINE_SCAN.resultSummary.cveEnrichment.os.cves,
          { cveId: 'CVE-2024-5678', severity: 'CRITICAL', cvssScore: 9.8, description: 'Critical RCE' },
        ],
      },
    },
  },
};
```

**Benefits**:
- Consistent test data
- Easy to add new scenarios
- Realistic scan structures
- Reusable across test files

**Dependencies**: Requires `sec-8nf` (integration tests) in progress

**Estimated Effort**: 2 hours
**Files**: New fixtures module

---

### `sec-z0y` - Add Structured Logging (P2)
**Goal**: Consistent logging with `[Notifications]` prefix

**Implementation**:
```typescript
// packages/data-ops/src/notifications/logger.ts
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'notifications' });

export function logNotificationCreated(notification: any): void {
  logger.info('[Notifications] Created', {
    id: notification.id,
    type: notification.type,
    severity: notification.severity,
    title: notification.title,
    deviceId: notification.deviceId,
    organizationId: notification.organizationId,
  });
}

export function logNotificationSuppressed(fingerprint: string, reason: string): void {
  logger.info('[Notifications] Suppressed', {
    fingerprint,
    reason,
  });
}

export function logNotificationError(error: Error, context: any): void {
  logger.error('[Notifications] Error', {
    error: error.message,
    stack: error.stack,
    ...context,
  });
}
```

**Usage**:
```typescript
// createNotifications()
if (existing) {
  logNotificationSuppressed(input.fingerprint, 'Within suppress window'); // ✅
  return null;
}

const created = await tx.insert(notifications).values(...).returning();
logNotificationCreated(created); // ✅
```

**Benefits**:
- Easy to grep logs: `grep '\[Notifications\]'`
- Structured data for log aggregation
- Mirrors legacy logging pattern
- Helps debugging across distributed workers

**Estimated Effort**: 2 hours
**Files**: New logger module, update queries
**References**: `docs/LEGACY_NOTIFICATIONS.md` logging

---

### `sec-2av` - Test D1 Concurrent Inserts (P1)
**Goal**: Verify unique index prevents race conditions

**Test Implementation**:
```typescript
// packages/data-ops/src/queries/__tests__/notifications-concurrency.test.ts
import { Miniflare } from 'miniflare';
import { initDatabase, getDb } from '../database/setup';
import { createNotifications } from '../queries/notifications';

describe('Notification Concurrency', () => {
  let mf: Miniflare;

  beforeAll(async () => {
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

  it('should prevent duplicate inserts with same fingerprint (unique index enforcement)', async () => {
    const fingerprint = 'test_concurrent';

    // Simulate 10 workers trying to insert same notification concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      createNotifications([{
        organizationId: 'org_test',
        deviceId: 'dev_test',
        type: 'NEW_PORT',
        severity: 'HIGH',
        title: `Test notification ${i}`,
        fingerprint, // ✅ Same fingerprint
        suppressUntil: new Date(Date.now() + 60000),
      }])
    );

    // Execute concurrently
    const results = await Promise.allSettled(promises);

    // Count successful inserts
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    // ✅ Should only have 1 successful insert (unique index enforced)
    expect(successful.length).toBe(1);
    expect(failed.length).toBe(9); // Others rejected by unique constraint

    // Verify database state
    const db = getDb();
    const all = await db.select().from(notifications).where(eq(notifications.fingerprint, fingerprint));

    expect(all).toHaveLength(1); // ✅ Only 1 row in database
  });

  it('should handle ON CONFLICT correctly (update suppress_until)', async () => {
    // ... test ON CONFLICT behavior
  });
});
```

**Dependencies**: Requires `sec-t4z` (INSERT...ON CONFLICT) completed first

**Estimated Effort**: 3 hours
**Files**: New concurrency test file

---

## Implementation Order

### Week 1: Database & Core Refactoring (P1 Tasks)

**Day 1-2: Database Safeguards**
1. `sec-z7r` - Partial unique index (2h)
2. `sec-sd0` - Add messageHash column (3h)
3. `sec-t4z` - Implement INSERT...ON CONFLICT (4h)

**Day 3-4: Catalog Integration**
4. `sec-or9` - Refactor change detector to use catalog (4h)
5. `sec-g6o` - Build typed notification helpers (4h)
6. `sec-2wk` - Create upsertNotification helper (3h)

**Day 5: Testing**
7. `sec-8nf` - Add integration tests (6h)
8. `sec-2av` - Test D1 concurrency (3h)

**Reviewer Prompt (end of Week 1)**  
Ping reviewer once `sec-2av` lands. Share: migration diffs, `upsertNotification` helper, and integration/concurrency test outputs. Ask for feedback on:
- Fingerprint/messageHash dedupe approach.
- Drizzle `onConflictDoUpdate` usage patterns.
- Test coverage expectations or additional edge cases to exercise.

---

### Week 2: Features & Enhancements (P2 Tasks)

**Day 1-2: Change Detection**
9. `sec-zg2` - Extend resultSummary with per-port metadata (4h)
10. `sec-8sh` - Add service drift notifications (3h)
11. `sec-11n` - Include service in fingerprints (2h)

**Day 3: CVE Improvements**
12. `sec-5j6` - Add CVE remediation tips (4h)
13. `sec-5gu` - Add CVE fix/regression notifications (4h)

**Day 4: Catalog & API**
14. `sec-xp0` - Add notification modules taxonomy (3h)
15. `sec-nmq` - Centralize severity mapping (2h)
16. `sec-ali` - Add message-builder utilities (2h)

**Day 5: Testing & Cleanup**
17. `sec-e4s` - Add catalog unit tests (2h)
18. `sec-ibq` - Create test fixtures (2h)
19. `sec-z0y` - Add structured logging (2h)

**Reviewer Prompt (end of Week 2)**  
Request review covering: service drift opt-in flow, CVE remediation messaging, and catalog/test changes. Provide context on any deviations from the planned fingerprints or severity mapping. Ask reviewer to confirm:
- Noise controls feel sufficient (opt-in flag defaults, suppression logic).
- Catalog copy + remediation guidance meet tone expectations.
- Additional notification types or data fields they want while code is fresh.

---

### Week 3: UI, Settings & Cleanup (P2 Tasks)

**Day 1-2: UI & Settings**
20. `sec-mml` - Validate org-wide read state (4h)
21. `sec-39q` - Add API serializers (3h)
22. `sec-1y2` - Severity threshold gating (3h)

**Day 3: Port Refinements**
23. `sec-acw` - Port closed notifications with context (2h)

**Day 4: Maintenance**
24. `sec-hwu` - Batched deleteOldNotifications (3h)

**Day 5: Buffer & Polish**
25. Review all changes
26. Documentation updates
27. Deploy Phase 2

**Reviewer Prompt (pre-deploy, Week 3 end)**  
Before shipping, send reviewer a deployment bundle summary: read-state behaviour validation, API/UI adjustments, cleanup job schedule, and outstanding risks. Ask for final sign-off on:
- Org-wide read semantics and UI copy.
- Deployment sequencing / migration ordering.
- Any post-deploy monitoring hooks or dashboards they need introduced.

---

### Optional (P3 - Future)**
- `sec-9e1` - Add metrics for suppressed notifications (2h)
- `sec-mlx` - Cache baseline scans (4-6h)

---

## Success Metrics

### Technical Metrics
- ✅ Zero duplicate notifications (unique index enforces)
- ✅ <100ms notification creation latency
- ✅ 100% test coverage for catalog functions
- ✅ <5% suppression rate (healthy deduplication)

### User Metrics
- ✅ Actionable notifications (remediation guidance)
- ✅ Reduced notification noise (better fingerprints)
- ✅ Consistent messaging (catalog-driven)

### Operational Metrics
- ✅ Zero notification system errors
- ✅ Structured logging for debugging
- ✅ Automatic cleanup (no manual intervention)

---

## Dependencies & Blockers

### External Dependencies
- D1 support for partial unique indexes (verify with Cloudflare)
- Drizzle `onConflictDoUpdate` API compatibility with D1

### Internal Dependencies
- Phase 1 (MVP) must be complete ✅
- CVE enrichment integration (for remediation tips)

### Critical Path
```
sec-z7r (partial index)
    ↓
sec-t4z (INSERT...ON CONFLICT)
    ↓
sec-2wk (upsertNotification helper)
    ↓
sec-or9 (catalog refactor)
    ↓
sec-g6o (typed helpers)
```

All other tasks can run in parallel after these foundation pieces.

---

## Risk Mitigation

### Risk 1: D1 Partial Index Support
**Mitigation**: Test with local D1, verify with Cloudflare docs. If not supported, keep full unique index and rely on application cleanup.

### Risk 2: Migration Downtime
**Mitigation**: Use zero-downtime migrations (add new columns as nullable first, backfill, then make required).

### Risk 3: Performance Degradation
**Mitigation**: Add indexes incrementally, monitor query performance, rollback if needed.

### Risk 4: Breaking Changes
**Mitigation**: Keep backward compatibility (add new features, don't remove old ones). Feature flag new notification types.

---

## References

- **Main Documentation**: `docs/NOTIFICATIONS/README.md`
- **Legacy Patterns**: `docs/LEGACY_NOTIFICATIONS.md`
- **Notification Catalog**: `packages/data-ops/src/notifications/catalog.ts`
- **Schema**: `packages/data-ops/src/schema/notifications.ts`
- **Queries**: `packages/data-ops/src/queries/notifications/`

---

**Last Updated**: 2025-11-09
**Status**: Planning Complete - Ready for Implementation
**Next Action**: Start Week 1 - Database Safeguards
