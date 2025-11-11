# Data Model

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

### Schema: `organization_notification_settings` Table

**File**: `packages/data-ops/src/schema/notifications.ts`

Stores per-organization email alert preferences introduced in **sec-1y2**.

```typescript
export const organizationNotificationSettings = sqliteTable(
  'organization_notification_settings',
  {
    id: cuidText().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: 'cascade' }),
    emailAllowedSeverities: text('email_allowed_severities', { mode: 'json' })
      .$type<Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'>>()
      .notNull()
      .default(sql`'["CRITICAL","HIGH"]'`),
    createdAt: now(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgIdx: index('org_notification_settings_org_idx').on(t.organizationId),
  })
);
```

Key points:

- **One row per organization** (unique on `organizationId`).
- `emailAllowedSeverities` holds the currently permitted severities (empty array = alerts disabled).
- Queried via `resolveEmailSeverities()` to gate email delivery.
- Mutated through `updateEmailSeveritiesOrDisable()` / `resetEmailSeveritiesToDefaults()`.

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
