# Deduplication Strategy

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

**File**: `packages/data-ops/src/queries/notifications/crud.ts`

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
