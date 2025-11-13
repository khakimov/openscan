import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { cuidText, now, updatedAt } from './utils';
import { organization } from './identity';
import { auth_user } from '../drizzle/auth-schema';
import { devices } from './inventory';
import { scanRuns } from './orchestration';

/**
 * Notifications Schema
 *
 * Purpose: Store in-app and email notifications triggered by scan result changes
 *
 * Key Features:
 * - Fingerprint-based deduplication (prevents notification spam)
 * - Time-based suppress windows (6h for ports, 24h for CVEs)
 * - Org-scoped storage (all users in org see the same notifications)
 * - Email delivery tracking (emailSent, emailSentAt)
 *
 * See: docs/NOTIFICATIONS/data-model.md for complete architecture
 */
export const notifications = sqliteTable('notifications', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // Optional user targeting (null = org-wide notification)
  userId: text('user_id').references(() => auth_user.id, { onDelete: 'cascade' }),

  // Related entities
  deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),
  scanRunId: text('scan_run_id').references(() => scanRuns.id, { onDelete: 'cascade' }),

  // Notification metadata
  type: text('type').notNull(), // 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'CVE_FIXED' | 'CVE_REGRESSED' | 'SERVICE_DRIFT'
  severity: text('severity').notNull(), // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  module: text('module').notNull(), // 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT' | 'GENERAL'

  title: text('title').notNull(),
  message: text('message'),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),

  // Deduplication: fingerprint + time window + messageHash
  fingerprint: text('fingerprint').notNull(), // e.g., "new_port:dev_123:tcp:22:openssh:9.6p1:ssh"
  suppressUntil: integer('suppress_until', { mode: 'timestamp_ms' }).notNull(), // Suppress duplicate notifications until this timestamp
  messageHash: text('message_hash').notNull(), // Full SHA-256 of title|message for defense-in-depth deduplication
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true), // FALSE when suppress window expires (for partial index)

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

  // Deduplication query: SELECT * WHERE organizationId = ? AND fingerprint = ? AND suppressUntil > NOW()
  dedupIdx: index('notifications_dedup_idx').on(t.organizationId, t.fingerprint, t.suppressUntil),

  // NOTE: Partial unique index created via custom SQL migration (Drizzle Kit doesn't support .where())
  // See migration file for: CREATE UNIQUE INDEX notifications_fingerprint_active_idx
  // ON notifications (organization_id, fingerprint) WHERE is_active = 1
  // CRITICAL: is_active is flipped to 0 by scheduled cleanup job when suppressUntil expires
  // This allows fingerprint reuse after suppress window expires - expired notifications don't block new ones
  // SQLite evaluates WHERE at index entry creation time (not query time), so we need persisted boolean

  // Unread count query: SELECT COUNT(*) WHERE organizationId = ? AND readAt IS NULL
  unreadIdx: index('notifications_unread_idx').on(t.organizationId, t.readAt),

  // Email delivery query: SELECT * WHERE emailSent = false AND severity IN ('CRITICAL', 'HIGH')
  emailPendingIdx: index('notifications_email_pending_idx').on(t.emailSent, t.severity),

  // Recent notifications query: SELECT * WHERE organizationId = ? ORDER BY createdAt DESC LIMIT 50
  createdAtIdx: index('notifications_created_at_idx').on(t.createdAt),
}));

// Relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  organization: one(organization, {
    fields: [notifications.organizationId],
    references: [organization.id],
  }),
  user: one(auth_user, {
    fields: [notifications.userId],
    references: [auth_user.id],
  }),
  device: one(devices, {
    fields: [notifications.deviceId],
    references: [devices.id],
  }),
  scanRun: one(scanRuns, {
    fields: [notifications.scanRunId],
    references: [scanRuns.id],
  }),
}));

/**
 * Organization Notification Settings
 *
 * Purpose: Configure email notification preferences at the organization level
 *
 * Legacy Pattern: Mirrors `UserCredentials.raw_new_vulns_emails` (CSV of severities)
 * but stored at the org level instead of per-user.
 *
 * Pattern:
 * - One row per organization (1:1 relationship)
 * - Controls which severities trigger email alerts
 * - Used by email worker to filter pending notifications
 *
 * See: docs/NOTIFICATIONS/design-decisions.md for configuration guide
 */
export const organizationNotificationSettings = sqliteTable('organization_notification_settings', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().unique().references(() => organization.id, { onDelete: 'cascade' }),

  // Email severity filtering
  // Stores allowed severities as JSON array (e.g., ['CRITICAL', 'HIGH'])
  // Default: ['CRITICAL', 'HIGH'] (same as legacy hardcoded filter)
  emailAllowedSeverities: text('email_allowed_severities', { mode: 'json' })
    .$type<Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'>>()
    .notNull()
    .default(sql`'["CRITICAL","HIGH"]'`),

  // Timestamps
  createdAt: now(),
  updatedAt: updatedAt(),
}, (t) => ({
  // Query: SELECT * WHERE organizationId = ?
  orgIdx: index('org_notification_settings_org_idx').on(t.organizationId),
}));

// Relations
export const organizationNotificationSettingsRelations = relations(organizationNotificationSettings, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationNotificationSettings.organizationId],
    references: [organization.id],
  }),
}));
