# Review Request: Phase 2 Notification System Hardening

**Reviewer**: @nailert
**Author**: Claude Code
**Date**: 2025-11-09
**Status**: Planning Complete - Seeking Approval to Implement

---

## 🎯 Executive Summary

I've completed the planning phase for **Phase 2: Notification System Hardening** based on your feedback and legacy pattern analysis. This review request covers:

1. **26 tracked issues** in beads (epic `sec-erx`)
2. **Complete implementation plan** in `docs/PHASE_2_NOTIFICATION_PLAN.md`
3. **Updated architecture documentation** in `docs/NOTIFICATIONS.md`
4. **3-week implementation roadmap** with clear priorities

**Key Question**: Does this plan align with your vision? Are there any priorities I should adjust or features I should add/remove?

---

## 📋 What's Been Done (Phase 1 - MVP Complete ✅)

### Implemented Features
- ✅ Database schema with fingerprint-based deduplication
- ✅ Change detection service (diffPorts, diffCVEs)
- ✅ Notification catalog module (centralized messaging)
- ✅ In-app notification UI (bell icon, dropdown)
- ✅ Server functions (TanStack Start API layer)
- ✅ **Critical Bug Fixes**:
  - Fixed stale scan data bug (pass fresh `resultSummary`)
  - Fixed race condition in deduplication (atomic transactions)
  - Fixed 6 other bugs (CVE map keys, baseline query, service name extraction, etc.)

### Current State
- **Status**: MVP functional but not production-hardened
- **Documentation**: Complete (`docs/NOTIFICATIONS.md` - 1550 lines)
- **Remaining Phase 1 Task**: End-to-end testing (one scan → verify notifications appear)

---

## 🔍 What Needs Review (Phase 2 Planning)

### 1. **Database Safeguards** (P1 - High Priority)

#### Issue: `sec-z7r` - Partial Unique Index
**Current**:
```sql
-- Full unique index (blocks fingerprint reuse forever)
CREATE UNIQUE INDEX notifications_fingerprint_unique_idx
ON notifications (organization_id, fingerprint);
```

**Proposed**:
```sql
-- Partial unique index (allows fingerprint reuse after suppress window)
CREATE UNIQUE INDEX notifications_fingerprint_active_idx
ON notifications (organization_id, fingerprint)
WHERE suppress_until > CURRENT_TIMESTAMP;
```

**Questions**:
1. ✅ **Is this worth the added complexity?** Legacy system used full unique index + manual cleanup. Should we keep it simple or add the partial index optimization?
2. 🚨 **Does Cloudflare D1 support partial indexes?** Need to verify before implementing. If not supported, we keep the full index.

**My Recommendation**: Start with full index (simpler), add partial index later if fingerprint exhaustion becomes an issue.

---

#### Issue: `sec-sd0` - Message Hash Column
**Proposed Schema**:
```typescript
export const notifications = sqliteTable('notifications', {
  fingerprint: text('fingerprint').notNull(), // Structured: "new_port:dev_123:22:tcp"
  messageHash: text('message_hash'),          // NEW: Hash of rendered message
  // Unique index on BOTH for defense in depth
});
```

**Rationale**: Legacy system used message hashing. Protects against accidental fingerprint divergence (two different messages with same fingerprint).

**Questions**:
1. ✅ **Should we add messageHash now or wait until we see fingerprint collisions?**
2. ❓ **Should we use messageHash as PRIMARY dedupe key** (like legacy) or keep fingerprint as primary?

**My Recommendation**: Add messageHash column now (cheap), but keep fingerprint as primary dedupe key. Use messageHash for observability (log when fingerprint matches but message differs).

---

#### Issue: `sec-t4z` - INSERT...ON CONFLICT

**Current Implementation** (Transaction-based):
```typescript
const notification = await db.transaction(async (tx) => {
  const [existing] = await tx.select().from(notifications).where(...);
  if (existing) return null; // Suppressed
  const [created] = await tx.insert(notifications).values(...).returning();
  return created;
});
```

**Proposed Implementation** (Drizzle UPSERT):
```typescript
const [notification] = await db
  .insert(notifications)
  .values({ /* ... */ })
  .onConflictDoUpdate({
    target: [notifications.organizationId, notifications.fingerprint],
    set: {
      suppressUntil: sql`EXCLUDED.suppress_until`, // Extend suppress window
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  })
  .returning();
```

**Benefits**:
- ✅ Single database round-trip (faster)
- ✅ Leverages unique index (database-enforced)
- ✅ More D1-compatible

**Questions**:
1. 🚨 **Does Drizzle's `onConflictDoUpdate` work correctly with D1?** Need to test.
2. ❓ **Should we update `suppressUntil` on conflict** (extend the suppress window) or keep it unchanged?

**My Recommendation**: Yes, switch to `onConflictDoUpdate`. Test thoroughly with `sec-2av` (concurrency test). Update `suppressUntil` on conflict to extend suppress window (prevents notification fatigue).

---

### 2. **Notification Catalog Integration** (P1 - High Priority)

#### Issue: `sec-or9` - Refactor Change Detector

**Current (Inline Strings)**:
```typescript
// change-detector.ts - HARD-CODED MESSAGES ❌
changes.push({
  type: 'NEW_PORT',
  severity: determinePortSeverity(port.port),
  title: `New ${serviceName} on port ${port.port} discovered`,
  message: getPortSecurityMessage(port),
  // ...
});
```

**Proposed (Catalog Functions)**:
```typescript
// change-detector.ts - CATALOG-DRIVEN ✅
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
  ...descriptor, // Type-safe notification descriptor
  data: { /* ... */ },
  fingerprint: `new_port:${deviceId}:${port.port}:${port.protocol}`,
  suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
});
```

**Questions**:
1. ✅ **Is this the right abstraction?** Catalog provides `{ type, severity, title, message }`, change detector adds `{ fingerprint, suppressUntil, data }`.
2. ❓ **Should catalog also generate fingerprints?** Would make it even more centralized.

**My Recommendation**: Yes, refactor to use catalog. Keep fingerprint generation in change detector (it's context-specific: deviceId, scanRunId). Catalog focuses on messaging, change detector focuses on diffing.

---

#### Issue: `sec-xp0` - Add Notification Modules

**Proposed Taxonomy**:
```typescript
export type NotificationModule =
  | 'NETWORK_SECURITY'        // Ports, services, firewall
  | 'VULNERABILITY_MANAGEMENT' // CVEs, patches
  | 'COMPLIANCE'              // Policy violations (future)
  | 'DISCOVERY';              // Asset changes (future)
```

**UI Impact**: Allows filtering like "Show only vulnerability notifications" or "Show only network security alerts".

**Questions**:
1. ✅ **Do we need modules now, or can we add them later?** Not required for MVP.
2. ❓ **What module names make sense for your use case?** Open to suggestions.

**My Recommendation**: Add modules now (P2 priority). It's a simple schema change and future-proofs the UI for filtering. Use legacy names as starting point: `NETWORK_SECURITY`, `VULNERABILITY_MANAGEMENT`.

---

### 3. **Change Detection Enhancements** (P2 - Medium Priority)

#### Issue: `sec-zg2` - Extend resultSummary with Per-Port Metadata

**Current Schema** (Inconsistent):
```typescript
// Sometimes service is a string, sometimes an object
{
  port: 22,
  protocol: 'tcp',
  state: 'open',
  service: 'ssh' // ❌ or { name: 'ssh' } or { name: 'ssh', product: 'OpenSSH' }
}
```

**Proposed Schema** (Normalized):
```typescript
{
  port: 22,
  protocol: 'tcp',
  state: 'open',
  service: {
    name: 'ssh',         // ✅ Always structured
    product: 'OpenSSH',  // ✅ Product name
    version: '9.3p1',    // ✅ Version string
    cpe: 'cpe:/a:openbsd:openssh:9.3p1' // ✅ Optional CPE for CVE matching
  }
}
```

**Benefits**:
- Enables service drift detection ("SSH upgraded from 9.3 to 9.4")
- Richer fingerprints (include product/version)
- Better CVE correlation (CPE matching)

**Questions**:
1. ✅ **Is this schema change worth it?** Requires updating port scan handler to normalize nmap output.
2. ❓ **Should we backfill existing scans?** Probably not - only apply to new scans going forward.
3. 🚨 **Will this break existing change detection?** Need to handle both old and new schemas during transition.

**My Recommendation**: Yes, implement this. It unlocks service drift detection (`sec-8sh`) which is valuable. Add backward compatibility in change detector to handle both schemas during transition.

---

#### Issue: `sec-8sh` - Add Service Drift Notifications

**Example Use Case**:
```
Scan 1: Port 22 → OpenSSH 9.3p1
Scan 2: Port 22 → OpenSSH 9.4p1

Notification: "Service change on port 22: OpenSSH 9.3p1 → OpenSSH 9.4p1"
```

**Questions**:
1. ✅ **Is service drift detection valuable?** Helps catch unauthorized updates or configuration drift.
2. ❓ **What severity should service drift be?** Proposed: `MEDIUM` (not critical, but worth investigating).
3. ❓ **Should we suppress service drift during known maintenance windows?** Advanced feature for later.

**My Recommendation**: Yes, implement service drift detection. Use `MEDIUM` severity. Requires `sec-zg2` (per-port metadata) completed first.

---

#### Issue: `sec-mlx` - Cache Baseline Scans (P3 - Low Priority)

**Current Flow** (Slow):
```typescript
// Every scan re-fetches and re-parses baseline
const baseline = await getLastSuccessfulScanForDevice({...}); // ❌ DB query + JSON parse
```

**Proposed Flow** (Cached):
```typescript
// Cache baseline in Redis or D1 table
const cacheKey = `baseline:${deviceId}`;
let baseline = await cache.get(cacheKey);
if (!baseline) {
  baseline = await getLastSuccessfulScanForDevice({...});
  await cache.set(cacheKey, baseline, { ttl: 3600 });
}
```

**Questions**:
1. ❓ **Is this optimization needed now?** Probably not - premature optimization.
2. ❓ **Redis or D1 cache table?** D1 table is simpler (no new dependencies).
3. ❓ **What's the actual performance bottleneck?** Need to profile first.

**My Recommendation**: Skip this for Phase 2 (P3 priority). Optimize later if change detection becomes a bottleneck. Focus on features, not performance, for now.

---

### 4. **CVE Diff Refinements** (P2 - Medium Priority)

#### Issue: `sec-5j6` - Add CVE Remediation Tips

**Current Notification**:
```
Title: New CRITICAL vulnerability CVE-2024-1234 discovered
Message: CVE-2024-1234 (CVSS 9.8): Remote code execution in OpenSSH
```

**Proposed Notification**:
```
Title: New CRITICAL vulnerability CVE-2024-1234 discovered
Message:
CVE-2024-1234 (CVSS 9.8)
Affected: OpenSSH 9.3p1 on port 22

Description: Remote code execution vulnerability allowing unauthenticated attackers to execute arbitrary code.

Remediation: Update OpenSSH to version 9.4p1 or later immediately.
✅ Patch available - update immediately

References: https://nvd.nist.gov/vuln/detail/CVE-2024-1234
```

**Questions**:
1. ✅ **Is this level of detail helpful or too verbose?** Want actionable notifications, not walls of text.
2. ❓ **Where do we get remediation data?** Options:
   - Necto API (if available)
   - NVD API (fallback)
   - Hardcoded templates for common CVEs (OpenSSL, SMB, etc.)
3. ❓ **Should we link to external resources** (NVD, vendor advisories)?

**My Recommendation**: Yes, add remediation tips. Start simple: use Necto API if available, otherwise generic advice ("Update affected service"). Add external links. Keep messages concise but actionable.

---

#### Issue: `sec-5gu` - Add CVE Fix/Regression Notifications

**New Notification Types**:
- `CVE_FIXED` - CVE was present, now gone (good news!)
- `CVE_REGRESSED` - CVE was fixed, now returned (bad news!)

**Example**:
```
Scan 1: CVE-2024-1234 present
Scan 2: CVE-2024-1234 absent
→ Notification: "Vulnerability CVE-2024-1234 has been resolved (likely patched)"

Scan 3: CVE-2024-1234 present again
→ Notification: "Vulnerability CVE-2024-1234 has regressed (was fixed, now vulnerable again)"
```

**Complexity**: Detecting regressions requires tracking CVE history. Options:
1. Store CVE history in separate table
2. Store CVE history in notification `data` field (simpler)
3. Skip regression detection for now (only detect fixes)

**Questions**:
1. ✅ **Is regression detection worth the complexity?** Useful for catching rollbacks or misconfigurations.
2. ❓ **How do we track CVE history?** Separate table or notification data field?
3. ❓ **Should we celebrate CVE fixes with positive notifications?** Good for morale!

**My Recommendation**: Yes, add `CVE_FIXED` notifications (easy - just check if CVE disappeared). Skip `CVE_REGRESSED` for now (requires history tracking). Add regression detection in Phase 3 if needed.

---

### 5. **Testing & Observability** (P1 - High Priority)

#### Issue: `sec-8nf` - Integration Tests for Full Pipeline

**Test Coverage Needed**:
```typescript
describe('Notification Pipeline Integration', () => {
  it('should create notification for new open port', async () => { /* ... */ });
  it('should suppress duplicate notifications within suppress window', async () => { /* ... */ });
  it('should create notification for new critical CVE', async () => { /* ... */ });
  it('should create notification for CVE severity increase', async () => { /* ... */ });
  it('should create notification for service drift', async () => { /* ... */ });
});
```

**Questions**:
1. ✅ **Should these be integration tests or e2e tests?** Integration tests (in-memory D1 with Miniflare).
2. ❓ **Should we test against real Restate worker?** Probably overkill - mock the postback instead.
3. ❓ **What's the minimum test coverage for Phase 2?** At least the happy path for each notification type.

**My Recommendation**: Yes, write integration tests. Use Miniflare + mock Necto API. Cover all notification types (new port, closed port, new CVE, CVE upgrade, service drift). Target 80% coverage.

---

#### Issue: `sec-2av` - Test D1 Concurrency

**Critical Test**:
```typescript
it('should prevent duplicate inserts with same fingerprint (unique index enforcement)', async () => {
  const fingerprint = 'test_concurrent';

  // Simulate 10 workers trying to insert same notification concurrently
  const promises = Array.from({ length: 10 }, (_, i) =>
    createNotifications([{ /* same fingerprint */ }])
  );

  const results = await Promise.allSettled(promises);

  // Should only have 1 successful insert (unique index enforced)
  expect(successful.length).toBe(1);
  expect(failed.length).toBe(9);

  // Verify database state
  const all = await db.select().from(notifications).where(eq(notifications.fingerprint, fingerprint));
  expect(all).toHaveLength(1); // ✅ Only 1 row in database
});
```

**Questions**:
1. 🚨 **Is this test critical?** YES - this is the whole point of the unique index fix.
2. ❓ **Can Miniflare accurately simulate D1 concurrency?** Need to verify.
3. ❓ **Should we test on real D1 (staging)?** Probably yes, after Miniflare tests pass.

**My Recommendation**: This test is CRITICAL. Write it first, verify with Miniflare, then test on staging D1. If test fails, the unique index + INSERT...ON CONFLICT approach doesn't work and we need to keep the transaction-based approach.

---

## 🗺️ Proposed 3-Week Implementation Schedule

### Week 1: Database & Core Refactoring (P1)
**Focus**: Make deduplication bulletproof

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon | `sec-z7r` Partial unique index | 2h | Migration + schema update |
| Mon | `sec-sd0` Add messageHash column | 3h | Migration + backfill script |
| Tue | `sec-t4z` INSERT...ON CONFLICT | 4h | Replace transaction-based dedupe |
| Tue | `sec-2av` Test D1 concurrency | 3h | Concurrency test passing |
| Wed | `sec-or9` Refactor change detector | 4h | Catalog integration complete |
| Thu | `sec-g6o` Typed notification helpers | 4h | Helper functions (notifyNewPort, etc.) |
| Thu | `sec-2wk` upsertNotification helper | 3h | Centralized upsert with logging |
| Fri | `sec-8nf` Integration tests | 6h | Full pipeline test coverage |

**Week 1 Exit Criteria**:
- ✅ Unique index prevents all duplicates (tested with concurrency test)
- ✅ Change detector uses catalog (no inline strings)
- ✅ Integration tests passing (80% coverage)

---

### Week 2: Features & Enhancements (P2)
**Focus**: Richer notifications and better detection

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon | `sec-zg2` Per-port metadata | 4h | Normalized service schema |
| Mon | `sec-8sh` Service drift notifications | 3h | SERVICE_DRIFT notification type |
| Tue | `sec-11n` Service in fingerprints | 2h | Enhanced fingerprint generation |
| Tue | `sec-5j6` CVE remediation tips | 4h | Actionable CVE notifications |
| Wed | `sec-5gu` CVE fix notifications | 4h | CVE_FIXED notification type |
| Thu | `sec-xp0` Notification modules | 3h | Module taxonomy added |
| Thu | `sec-nmq` Centralize severity mapping | 2h | All severity logic in catalog |
| Thu | `sec-ali` Message-builder utilities | 2h | buildPortMessage, buildCVEMessage |
| Fri | `sec-e4s` Catalog unit tests | 2h | Test all catalog functions |
| Fri | `sec-ibq` Test fixtures | 2h | Realistic test data |
| Fri | `sec-z0y` Structured logging | 2h | [Notifications] prefix everywhere |

**Week 2 Exit Criteria**:
- ✅ Service drift detection working
- ✅ CVE notifications have remediation guidance
- ✅ All catalog functions tested

---

### Week 3: UI, Settings & Polish (P2)
**Focus**: User-facing improvements and operational excellence

| Day | Task | Hours | Deliverable |
|-----|------|-------|-------------|
| Mon | `sec-mml` Validate read state requirements | 4h | Confirm org-wide vs per-user |
| Tue | `sec-39q` API serializers | 3h | Consistent payloads across clients |
| Tue | `sec-1y2` Severity threshold gating | 3h | Configurable email thresholds |
| Wed | `sec-acw` Port closed notifications | 2h | Enhanced context for closures |
| Thu | `sec-hwu` Batched cleanup | 3h | Scheduled notification cleanup |
| Fri | **Buffer & Polish** | 8h | Documentation, final testing, deploy |

**Week 3 Exit Criteria**:
- ✅ All Phase 2 features implemented
- ✅ Documentation updated
- ✅ Ready for production deployment

---

## ❓ Questions for Reviewer

### Critical Questions (Block Implementation)

1. **Database Partial Index Support**
   - 🚨 Does Cloudflare D1 support partial unique indexes (`WHERE suppress_until > CURRENT_TIMESTAMP`)?
   - If NOT: Keep full unique index, rely on application cleanup
   - If YES: Implement partial index (allows fingerprint reuse)

2. **Drizzle onConflictDoUpdate with D1**
   - 🚨 Does Drizzle's `.onConflictDoUpdate()` work correctly with D1?
   - **Action**: Need to test this FIRST before committing to the approach
   - **Fallback**: Keep transaction-based dedupe if onConflict doesn't work

3. **Message Hash Priority**
   - ❓ Should `messageHash` be the PRIMARY dedupe key (like legacy) or secondary?
   - **Option A**: Primary key = fingerprint (structured), messageHash = secondary (content-based)
   - **Option B**: Primary key = messageHash (like legacy), fingerprint = metadata only
   - **My Preference**: Option A (fingerprint primary, messageHash secondary for observability)

### Design Questions (Need Input)

4. **Service Drift Detection**
   - ✅ Is detecting service version changes valuable for your use case?
   - Example: "SSH upgraded from 9.3 to 9.4" or "nginx downgraded from 1.24 to 1.23"
   - **Trade-off**: More notifications (could be noisy)

5. **CVE Remediation Sources**
   - ❓ Where should we get remediation advice?
   - **Options**:
     - Necto API (if they provide it)
     - NVD API (official but may be slow)
     - Hardcoded templates for common CVEs
     - All of the above (waterfall)

6. **Notification Modules**
   - ❓ What module names make sense for your domain?
   - **Proposed**: `NETWORK_SECURITY`, `VULNERABILITY_MANAGEMENT`, `COMPLIANCE`, `DISCOVERY`
   - **Question**: Any others needed? Different names preferred?

7. **Org-Wide vs Per-User Read State**
   - ✅ Confirm: "Mark all as read" should affect ALL users in the org (current behavior)?
   - **Alternative**: Track read state per-user (requires junction table)
   - **My Assumption**: Org-wide is correct for security notifications (team-based review)

### Priority Questions (Adjust Schedule)

8. **Phase 2 Scope**
   - ❓ Are all 26 tasks necessary, or should we cut some?
   - **Candidates for Deferral**:
     - `sec-mlx` (baseline caching) - Performance optimization, probably not needed
     - `sec-9e1` (suppression metrics) - Nice-to-have observability
     - `sec-acw` (port closed context) - Minor enhancement
   - **Your Call**: Which tasks are must-haves vs nice-to-haves?

9. **Testing Coverage**
   - ❓ What's the minimum acceptable test coverage for Phase 2?
   - **Proposed**: 80% coverage for new code, integration tests for all notification types
   - **Trade-off**: More tests = slower development, but higher confidence

10. **Deployment Strategy**
    - ❓ Should we deploy incrementally (week by week) or all at once (end of Week 3)?
    - **Option A**: Deploy after Week 1 (database safeguards only) - Lower risk
    - **Option B**: Deploy after Week 3 (all features) - More testing time

---

## 📦 Code Samples for Review

### Sample 1: Proposed `upsertNotification` Helper

```typescript
// packages/data-ops/src/queries/notifications.ts
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
        userId: input.userId ?? null,
        deviceId: input.deviceId ?? null,
        scanRunId: input.scanRunId ?? null,
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message ?? null,
        data: input.data ?? null,
        fingerprint: input.fingerprint,
        messageHash: hashMessage(input.title, input.message), // NEW
        suppressUntil: input.suppressUntil,
        readAt: null,
        emailSent: false,
        emailSentAt: null,
      })
      .onConflictDoUpdate({
        target: [notifications.organizationId, notifications.fingerprint],
        set: {
          // Extend suppress window on conflict
          suppressUntil: sql`EXCLUDED.suppress_until`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning();

    console.log(`[Notifications] Created: ${notification.type} (${notification.severity}) - ${notification.title}`);
    return notification;

  } catch (error) {
    if (isUniqueConstraintError(error)) {
      console.log(`[Notifications] Suppressed duplicate: ${input.fingerprint}`);
      return null;
    }

    console.error(`[Notifications] Failed to create notification`, {
      fingerprint: input.fingerprint,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

function hashMessage(title: string, message?: string): string {
  const content = `${title}|${message || ''}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
```

**Questions**:
- ✅ Is this the right abstraction?
- ❓ Should we extend `suppressUntil` on conflict, or keep it unchanged?
- ❓ Is the logging too verbose/not verbose enough?

---

### Sample 2: Proposed Catalog Integration

```typescript
// packages/data-ops/src/notifications/catalog.ts
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
    module: 'NETWORK_SECURITY', // NEW
    type: 'NEW_PORT',
    severity,
    title: `New ${serviceName} on port ${port} discovered`,
    message: securityMessage,
  };
}

// apps/user-application/src/server/notifications/change-detector.ts
import { createNewPortNotification } from '@repo/data-ops/notifications/catalog';

function diffPorts(...): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  for (const [key, port] of currPortMap) {
    if (isNowOpen && !wasOpen) {
      const descriptor = createNewPortNotification({
        port: port.port,
        protocol: port.protocol,
        service: port.service?.name,
        version: port.service?.version,
      });

      changes.push({
        organizationId,
        deviceId,
        scanRunId,
        ...descriptor, // Spread catalog descriptor
        data: {
          port: port.port,
          protocol: port.protocol,
          service: port.service,
          state: port.state,
          version: port.version,
        },
        fingerprint: `new_port:${deviceId}:${port.port}:${port.protocol}`,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
      });
    }
  }

  return changes;
}
```

**Questions**:
- ✅ Is the separation of concerns clear? (Catalog = messaging, ChangeDetector = diffing)
- ❓ Should catalog also generate fingerprints? Or keep them in change detector?
- ❓ Is adding `module` field now premature, or future-proof?

---

### Sample 3: Proposed Service Drift Detection

```typescript
// apps/user-application/src/server/notifications/change-detector.ts
function diffPorts(...): Array<CreateNotificationInput> {
  const changes: Array<CreateNotificationInput> = [];

  for (const [key, currPort] of currPortMap) {
    const prevPort = prevPortMap.get(key);

    // NEW: Detect service drift (product/version changes)
    if (prevPort && currPort.state === 'open' && prevPort.state === 'open') {
      const productChanged = currPort.service?.product !== prevPort.service?.product;
      const versionChanged = currPort.service?.version !== prevPort.service?.version;

      if (productChanged || versionChanged) {
        const descriptor = createServiceDriftNotification({
          port: currPort.port,
          protocol: currPort.protocol,
          previousService: prevPort.service,
          currentService: currPort.service,
        });

        changes.push({
          organizationId,
          deviceId,
          scanRunId,
          ...descriptor,
          data: {
            port: currPort.port,
            previousService: prevPort.service,
            currentService: currPort.service,
          },
          fingerprint: `service_drift:${deviceId}:${currPort.port}:${currPort.protocol}:${currPort.service?.version}`,
          suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000),
        });
      }
    }

    // ... rest of port diffing logic
  }

  return changes;
}
```

**Questions**:
- ✅ Is service drift detection valuable?
- ❓ Should we suppress drift during known maintenance windows? (Advanced feature for later)
- ❓ What severity should service drift be? (Proposed: `MEDIUM`)

---

## 🚀 Recommended Next Steps

### Immediate Actions (Before Starting Week 1)

1. **Verify D1 Compatibility** (BLOCKING)
   ```bash
   # Test partial unique index support
   pnpm wrangler d1 execute sec-db --local --command="
     CREATE UNIQUE INDEX test_partial_idx
     ON notifications (organization_id, fingerprint)
     WHERE suppress_until > CURRENT_TIMESTAMP;
   "
   ```

   - ✅ **If works**: Proceed with `sec-z7r` (partial index)
   - ❌ **If fails**: Keep full unique index, update plan

2. **Test Drizzle onConflictDoUpdate** (BLOCKING)
   ```typescript
   // Quick test in local environment
   const result = await db
     .insert(notifications)
     .values({ /* ... */ })
     .onConflictDoUpdate({
       target: [notifications.organizationId, notifications.fingerprint],
       set: { suppressUntil: sql`EXCLUDED.suppress_until` },
     })
     .returning();

   console.log('onConflictDoUpdate result:', result);
   ```

   - ✅ **If works**: Proceed with `sec-t4z` (INSERT...ON CONFLICT)
   - ❌ **If fails**: Keep transaction-based dedupe, update plan

3. **Review & Approve Plan**
   - Read `docs/PHASE_2_NOTIFICATION_PLAN.md` (comprehensive implementation guide)
   - Answer critical questions above
   - Adjust priorities if needed
   - Approve to start Week 1

### Week 1 Kickoff (After Approval)

1. **Start Database Safeguards**:
   ```bash
   bd update sec-z7r --status in_progress
   ```

2. **Daily Standups** (Async Updates):
   - Post progress in beads: `bd update sec-xxx --status completed`
   - Flag blockers immediately
   - Share code samples for early review

3. **End of Week 1 Review**:
   - Demo integration tests passing
   - Show concurrency test results
   - Review catalog integration
   - Decide: Deploy Week 1 changes or wait for Week 3?

---

## 📚 Reference Documents

### Must-Read Before Implementation
1. **`docs/NOTIFICATIONS.md`** (1550 lines) - Complete Phase 1 architecture
   - Sections to review:
     - `#architecture-overview` - High-level flow
     - `#deduplication-strategy` - Current dedupe approach (to be improved)
     - `#bug-fixes--improvements` - All fixes from Phase 1
     - `#comparison-sec-vs-legacy-footprint` - Patterns we're adopting

2. **`docs/LEGACY_NOTIFICATIONS.md`** - Legacy system patterns
   - Sections to review:
     - `#atomic-deduplication` - How legacy system prevented duplicates
     - `#notification-catalog--template-library` - Message template pattern
     - `#table-maintenance` - Batched cleanup approach

3. **`docs/PHASE_2_NOTIFICATION_PLAN.md`** (NEW - this request) - Detailed implementation plan
   - All 26 tasks with code samples
   - 3-week schedule
   - Success metrics

### Supporting Files
4. **`packages/data-ops/src/notifications/catalog.ts`** - Notification message templates
5. **`packages/data-ops/src/schema/notifications.ts`** - Database schema
6. **`packages/data-ops/src/queries/notifications.ts`** - Current CRUD operations (to be refactored)
7. **`apps/user-application/src/server/notifications/change-detector.ts`** - Change detection logic (to be refactored)

---

## 🎯 Success Criteria for Phase 2

### Technical Metrics
- ✅ **Zero duplicate notifications** (unique index + INSERT...ON CONFLICT enforces)
- ✅ **<100ms notification creation latency** (single DB round-trip)
- ✅ **100% test coverage for catalog functions**
- ✅ **<5% suppression rate** (healthy deduplication, not excessive)

### User Experience Metrics
- ✅ **Actionable notifications** (CVE remediation guidance, port security tips)
- ✅ **Reduced notification noise** (better fingerprints, service drift detection)
- ✅ **Consistent messaging** (catalog-driven, no typos or formatting inconsistencies)

### Operational Metrics
- ✅ **Zero notification system errors** (robust error handling)
- ✅ **Structured logging** (`[Notifications]` prefix for easy debugging)
- ✅ **Automatic cleanup** (scheduled batched deletes, no manual intervention)

### Code Quality Metrics
- ✅ **No hardcoded strings** (all messages in catalog)
- ✅ **Type-safe notification creation** (TypeScript enforces correct parameters)
- ✅ **Clear separation of concerns** (catalog = messaging, change-detector = diffing, queries = persistence)

---

## 💭 Final Thoughts & Open Questions

### What I'm Confident About
- ✅ Database safeguards (partial index, INSERT...ON CONFLICT) will prevent duplicates
- ✅ Catalog integration will improve maintainability and consistency
- ✅ Integration tests will catch regressions
- ✅ 3-week timeline is achievable with focused work

### What I'm Uncertain About
- ❓ Is service drift detection too noisy? (Need real-world usage data)
- ❓ Should we add more notification types? (TLS certificate expiration, httpx changes, etc.)
- ❓ Is org-wide read state the right choice long-term? (May need per-user later)
- ❓ Are we over-engineering? (26 tasks feels like a lot for "hardening")

### What Could Go Wrong
- 🚨 **D1 doesn't support partial indexes** → Fallback to full index + cleanup
- 🚨 **Drizzle onConflictDoUpdate doesn't work with D1** → Fallback to transactions
- 🚨 **Service drift is too noisy** → Add suppress controls or make it opt-in
- 🚨 **CVE remediation data is unreliable** → Fall back to generic advice

### Contingency Plans
- Keep transaction-based dedupe if INSERT...ON CONFLICT doesn't work
- Keep full unique index if partial index isn't supported
- Make service drift opt-in if it's too noisy
- Use generic remediation advice if Necto/NVD APIs are unreliable

---

## ✅ Approval Checklist

Please review and confirm:

- [ ] I've read `docs/NOTIFICATIONS.md` (Phase 1 architecture)
- [ ] I've read `docs/PHASE_2_NOTIFICATION_PLAN.md` (detailed implementation plan)
- [ ] I've reviewed the critical questions (D1 support, onConflictDoUpdate, messageHash priority)
- [ ] I've reviewed the code samples (upsertNotification, catalog integration, service drift)
- [ ] I approve the 3-week implementation schedule (or have requested changes)
- [ ] I've identified any missing features or priorities to adjust
- [ ] I'm ready to kick off Week 1 (or have blockers to resolve first)

---

**Ready to proceed?** Please provide feedback on:
1. Critical questions (D1 compatibility, Drizzle onConflictDoUpdate)
2. Design questions (service drift, CVE remediation, notification modules)
3. Priority adjustments (any tasks to cut/add/reorder?)
4. Deployment strategy (incremental or all-at-once?)
5. Any other concerns or suggestions

Once approved, I'll:
1. Test D1 compatibility (partial index, onConflictDoUpdate)
2. Update plan based on test results
3. Start `sec-z7r` (Week 1, Day 1)
4. Post daily progress updates in beads

Thank you for the detailed review! 🙏
