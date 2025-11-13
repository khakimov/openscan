# Deployment Checklist - Migration 0010 (Composite Fingerprint Index)

**Migration**: `0010_composite_fingerprint_index.sql`
**Date**: 2025-11-09
**Impact**: Low risk - Index swap, no data changes
**Downtime**: None (online DDL operation)

## Pre-Deployment Checklist

### Code Review
- [x] Migration reviewed and approved
- [x] ON CONFLICT target updated to match new index
- [x] Test coverage validates fingerprint reuse behavior
- [x] `checkDuplicateNotification` refined to filter active rows only
- [x] All tests passing (7/7)

### Documentation
- [x] `COMPOSITE_INDEX_FIX.md` - Technical deep-dive
- [x] `SEC-XP0_MODULE_TAXONOMY_IMPLEMENTATION.md` - Module field context
- [x] Code comments updated for composite index pattern

### Testing
- [x] Unit tests pass with composite index
- [x] Concurrent upsert test validates no duplicates
- [x] Fingerprint reuse test validates fresh row insertion
- [x] Test schema matches production constraint

## Staging Deployment

### Step 1: Deploy Migration
```bash
# Connect to staging D1 database
wrangler d1 execute sec-rocks-staging --file=packages/data-ops/migrations/0010_composite_fingerprint_index.sql

# Verify migration applied
wrangler d1 execute sec-rocks-staging --command="SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'notifications%';"

# Expected output:
# - notifications_org_idx
# - notifications_device_idx
# - notifications_user_idx
# - notifications_dedup_idx
# - notifications_unread_idx
# - notifications_email_pending_idx
# - notifications_created_at_idx
# - notifications_org_fingerprint_active_uq  ← NEW composite index

# Verify old partial index is gone
wrangler d1 execute sec-rocks-staging --command="SELECT name FROM sqlite_master WHERE type='index' AND name='notifications_fingerprint_active_idx';"
# Expected: No results (index dropped)
```

### Step 2: Deploy Application Code
```bash
# Deploy updated upsertNotification with new ON CONFLICT target
pnpm --filter @repo/user-application deploy
```

### Step 3: Monitor Hourly Cleanup Job
```bash
# Trigger expireNotifications manually or wait for scheduled run
# This verifies the cleanup job still works with the new index

# Check logs for:
# - "[Notifications] Expired N notifications"
# - No errors from database constraints
```

### Step 4: Verify Fingerprint Reuse
```bash
# Query for duplicate fingerprints with different is_active values
wrangler d1 execute sec-rocks-staging --command="
  SELECT fingerprint, COUNT(*) as count, SUM(is_active) as active_count
  FROM notifications
  GROUP BY fingerprint
  HAVING count > 1;
"

# Expected: Some fingerprints have count > 1 (historical reuse)
#           but active_count should always be 0 or 1 (never > 1)
```

### Step 5: Staging Soak Test
- [ ] Run staging for 24 hours
- [ ] Monitor notification creation logs
- [ ] Check for duplicate constraint violations
- [ ] Verify suppress window extension still works
- [ ] Confirm expired notifications can be reused

## Production Deployment

### Pre-Flight Checks
- [ ] Staging migration successful (no errors)
- [ ] Cleanup job ran successfully in staging
- [ ] No duplicate active fingerprints in staging
- [ ] Application logs show normal notification flow
- [ ] 24-hour soak test completed

### Step 1: Backup Current State
```bash
# Export current notifications table structure
wrangler d1 execute sec-rocks --command=".schema notifications" > notifications_schema_backup.sql

# Count active vs inactive notifications (baseline)
wrangler d1 execute sec-rocks --command="
  SELECT
    is_active,
    COUNT(*) as count,
    COUNT(DISTINCT fingerprint) as unique_fingerprints
  FROM notifications
  GROUP BY is_active;
"
```

### Step 2: Deploy Migration
```bash
# Run migration on production D1
wrangler d1 execute sec-rocks --file=packages/data-ops/migrations/0010_composite_fingerprint_index.sql

# Verify new index created
wrangler d1 execute sec-rocks --command="
  SELECT sql FROM sqlite_master
  WHERE type='index' AND name='notifications_org_fingerprint_active_uq';
"

# Expected output:
# CREATE UNIQUE INDEX `notifications_org_fingerprint_active_uq`
# ON `notifications` (`organization_id`, `fingerprint`, `is_active`)
```

### Step 3: Deploy Application Code
```bash
# Deploy to production
pnpm --filter @repo/user-application deploy:production

# Monitor deployment logs for errors
```

### Step 4: Post-Deployment Validation

#### Immediate Checks (0-5 minutes)
```bash
# 1. Verify no duplicate constraint violations
# Check application logs for "UNIQUE constraint failed"

# 2. Verify notifications still being created
wrangler d1 execute sec-rocks --command="
  SELECT COUNT(*) FROM notifications
  WHERE created_at > datetime('now', '-5 minutes');
"

# 3. Check for ON CONFLICT updates (suppress window extensions)
# Look for "[Notifications] Suppress window extended" in logs
```

#### Short-term Monitoring (1 hour)
- [ ] Monitor Analytics Engine for `postback_portscan_success` events
- [ ] Check error rates in application logs
- [ ] Verify no increase in database errors
- [ ] Confirm upsert operations completing successfully

#### Medium-term Monitoring (24 hours)
- [ ] Wait for scheduled `expireNotifications` cron job
- [ ] Verify expired notifications marked `is_active = false`
- [ ] Check for fingerprint reuse after expiry
- [ ] Monitor notification creation rate (should be normal)

### Step 5: Validation Queries

**Check for duplicate active notifications** (should be zero):
```sql
SELECT
  organization_id,
  fingerprint,
  COUNT(*) as active_count
FROM notifications
WHERE is_active = 1
GROUP BY organization_id, fingerprint
HAVING active_count > 1;
```

**Verify fingerprint reuse working** (should see examples):
```sql
SELECT
  fingerprint,
  COUNT(*) as total_rows,
  SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_rows,
  SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_rows
FROM notifications
GROUP BY fingerprint
HAVING total_rows > 1
ORDER BY total_rows DESC
LIMIT 10;
```

**Check index usage**:
```sql
EXPLAIN QUERY PLAN
SELECT * FROM notifications
WHERE organization_id = 'org_123'
  AND fingerprint = 'new_port:dev_456:22:tcp'
  AND is_active = 1;

-- Expected: USING INDEX notifications_org_fingerprint_active_uq
```

## Rollback Plan

If issues are detected, rollback by recreating the partial index:

```sql
-- Step 1: Drop composite index
DROP INDEX IF EXISTS notifications_org_fingerprint_active_uq;

-- Step 2: Recreate partial index
CREATE UNIQUE INDEX notifications_fingerprint_active_idx
ON notifications (organization_id, fingerprint)
WHERE is_active = 1;
```

**Note**: Rollback also requires reverting application code to use old ON CONFLICT target:
```typescript
target: [notifications.organizationId, notifications.fingerprint]
```

## Success Criteria

- ✅ Migration applies successfully without errors
- ✅ No duplicate active notifications (constraint enforced)
- ✅ Notifications continue to be created normally
- ✅ Suppress window extension works (ON CONFLICT updates)
- ✅ Fingerprint reuse works after expiry (new rows inserted)
- ✅ No increase in application error rates
- ✅ Cleanup job runs successfully

## Monitoring Dashboards

### Analytics Engine Queries

**Notification creation rate**:
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/b846a37c6228b2869896493f338f17d5/analytics_engine/sql" \
  -H "Authorization: Bearer YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8" \
  -d "SELECT
      toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour,
      COUNT(*) AS notifications_created
      FROM postback_events
      WHERE index1 = 'postback_portscan_success'
      AND timestamp >= NOW() - INTERVAL '24' HOUR
      GROUP BY hour
      ORDER BY hour DESC" | jq .
```

**Error rate monitoring**:
```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/b846a37c6228b2869896493f338f17d5/analytics_engine/sql" \
  -H "Authorization: Bearer YGeh93yMgMl32K_GErNgyl36BeomWrF0ZcvlS2q8" \
  -d "SELECT
      index1 AS event_type,
      COUNT(*) AS total
      FROM postback_events
      WHERE timestamp >= NOW() - INTERVAL '1' HOUR
      GROUP BY event_type" | jq .
```

## Post-Deployment Tasks

- [ ] Update runbook to reference composite index pattern
- [ ] Document cleanup job frequency and behavior
- [ ] Add monitoring alert for duplicate active notifications
- [ ] Schedule review of inactive notification accumulation (90 days)

## Communication Plan

### Before Deployment
- Notify team of deployment window
- Share expected impact (none - transparent DDL operation)
- Provide rollback plan contact

### During Deployment
- Post status updates in #engineering
- Monitor error rates in real-time
- Be ready to execute rollback if needed

### After Deployment
- Confirm successful deployment
- Share validation query results
- Document any unexpected behavior
- Schedule follow-up review (1 week)

## References

- **Technical Details**: `packages/data-ops/docs/COMPOSITE_INDEX_FIX.md`
- **Module Implementation**: `packages/data-ops/docs/SEC-XP0_MODULE_TAXONOMY_IMPLEMENTATION.md`
- **Migration File**: `packages/data-ops/migrations/0010_composite_fingerprint_index.sql`
- **Test Coverage**: `packages/data-ops/src/queries/__tests__/notifications.test.ts`

---

**Prepared by**: Claude Code
**Date**: 2025-11-09
**Migration**: 0010_composite_fingerprint_index
**Risk Level**: Low
**Rollback Complexity**: Low
