# Design Decisions

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
