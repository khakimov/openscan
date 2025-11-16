# Bug Fixes & Improvements

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

**Location**: `packages/data-ops/src/queries/notifications/crud.ts`

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

**Location**: `packages/data-ops/src/queries/notifications/crud.ts`

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

**Location**: `packages/data-ops/src/queries/notifications/dedupe.ts`

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
