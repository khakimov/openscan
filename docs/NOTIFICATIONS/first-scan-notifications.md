# First Scan Notifications - Design Question

## Current Behavior

**Problem:** When a device is scanned for the **first time**, no notifications are created.

**Log evidence:**
```
[Change Detection] No baseline scan found - first successful scan
```

**Code location:** `apps/user-application/src/server/notifications/change-detector/baseline.ts`

The change detector skips notification creation when there's no previous scan to compare against.

## Design Question

**Should we create notifications on the first scan?**

### Scenario: First Scan Discovers Issues

```
Before first scan: Unknown state (no data)
After first scan:  6 open ports discovered
                   16 CVEs discovered (1 HIGH, 15 LOW)
```

**Current behavior:** No notifications created (nothing to compare against)

**Alternative behavior:** Treat "no previous scan" as baseline of 0 ports, 0 CVEs
- Would create: 6 × NEW_PORT notifications
- Would create: 16 × NEW_CVE notifications (or 1 aggregate notification)

## Questions to Research in Legacy Code

**Goal:** Understand how the legacy Python system (`legacy/app/back/footprint_app/`) handled first-time discoveries.

### Key Questions

1. **Did legacy create notifications on first scan?**
   - Files to check: `legacy/app/back/footprint_app/notifications/`
   - Search for: Logic that creates notifications when baseline doesn't exist
   - Look for: "first scan" / "no previous scan" / "baseline missing" conditions

2. **How did legacy handle "new asset discovered"?**
   - When a device was first added to inventory
   - Did it send alerts for initial findings?
   - Or only for changes after second scan?

3. **What was the product decision?**
   - Was this intentional UX (don't spam on first scan)?
   - Or was it a limitation (baseline required for diff logic)?

4. **Edge case: Device re-added after deletion**
   - If a device was deleted and re-added
   - Should first scan after re-add trigger notifications?
   - Legacy behavior?

## Implementation Options

### Option A: Keep Current (No notifications on first scan)

**Pros:**
- Avoids notification spam when onboarding many devices
- User explicitly scanned, so they know what was found (can check UI)
- Cleaner for bulk imports

**Cons:**
- Silent failures: If critical ports/CVEs exist from day 1, user isn't alerted
- Inconsistent: User expects alerts when they see "1 HIGH CVE" badge

### Option B: Create Notifications on First Scan

**Pros:**
- User gets immediate alerts for critical findings (HIGH/CRITICAL CVEs, risky ports)
- Consistent: Every discovery is notified, regardless of when device was added
- Better for security: Don't miss critical issues on new assets

**Cons:**
- Notification burst when onboarding (could be 100+ notifications for 10 devices)
- May feel noisy if user is importing known inventory

### Option C: Hybrid Approach (Severity-Gated First Scan)

**Pros:**
- Only notify for CRITICAL/HIGH severity on first scan
- Reduces noise while catching critical issues
- Subsequent scans notify on all changes (any severity)

**Implementation:**
```typescript
if (!baselineScan) {
  // First scan: only notify HIGH/CRITICAL
  const criticalPorts = newPorts.filter(p => severity === 'HIGH' || severity === 'CRITICAL');
  const criticalCVEs = newCVEs.filter(c => c.severity === 'HIGH' || c.severity === 'CRITICAL');
  createNotifications(criticalPorts.concat(criticalCVEs));
} else {
  // Subsequent scans: notify all changes
  createNotifications(allChanges);
}
```

### Option D: User Preference (Onboarding Mode)

**Pros:**
- Let organizations choose behavior
- "Onboarding mode" = suppress first-scan notifications
- "Production mode" = alert on everything

**Cons:**
- Adds complexity
- Need UI for preference

## Recommendation Path

1. **Research legacy behavior** (answer questions above)
2. **Check Notion/Jira** for product decisions (search: "first scan", "new device alerts")
3. **If legacy created notifications:** Match that behavior (Option B or C)
4. **If legacy skipped notifications:** Verify it was intentional, consider improving (Option C)

## Related Code

**Change detector:**
- `apps/user-application/src/server/notifications/change-detector/baseline.ts:30-40`
  - `getScanHistory()` returns empty array for first scan
  - Early return skips all notification logic

**Port diff logic:**
- `apps/user-application/src/server/notifications/change-detector/diff-ports.ts`
  - `diffPorts(currentPorts, previousPorts)`
  - If `previousPorts` is empty, all ports are "new"
  - Could be leveraged for Option B/C

**CVE diff logic:**
- `apps/user-application/src/server/notifications/change-detector/diff-cves.ts`
  - Same pattern: needs baseline to detect "new"

## Testing

**After decision, test scenarios:**

1. **First scan with critical findings**
   - Device scanned for first time
   - Has 1 CRITICAL CVE + 1 HIGH port (e.g., Telnet on 23)
   - Expected: Notification created (Option B/C) OR No notification (Option A)

2. **Second scan after first scan**
   - Same ports/CVEs as first scan
   - Expected: No notifications (no changes)

3. **Second scan with new issue**
   - New port 8080 opens
   - Expected: NEW_PORT notification

4. **Bulk import of 10 devices**
   - All scanned at once
   - Expected: How many notifications total? (affects UX)

---

## Decision: Option B (Create Notifications on First Scan) ✅

**Rationale:** Legacy system (`footprint_app`) ALWAYS created notifications on first scan:
- `Notification.new_device(device)` triggered immediately on first scan
- `Notification.new_webapp(webapp)` fired for each discovered service
- `app.notify_added_vulnerabilities()` sent CVE alerts even on initial discovery

**Implementation:** Modified `change-detector/index.ts` to:
- Remove early return when `recentScans.length === 0`
- Pass `null` as baseline to diff functions (they already handle this correctly)
- `diffPorts(current, null, deviceId)` treats empty baseline as `[]`, so all ports are "new"
- `diffCVEs(current, null, deviceId)` treats empty baseline as `[]`, so all CVEs are "new"

**Email noise control:** Org-level severity settings (sec-1y2) already filter email delivery:
- Default: Only CRITICAL + HIGH trigger emails
- First scan with 6 LOW ports → 6 in-app notifications, 0 emails
- First scan with 1 CRITICAL CVE → 1 in-app + 1 email ✅

**Code changes:**
- `apps/user-application/src/server/notifications/change-detector/index.ts:71-84`
- Documentation: This file

**Next step:** Test with real scan to verify 6 NEW_PORT notifications are created.
