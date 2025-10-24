import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { cuidText, now } from './utils';
import { organization } from './identity';
import { auth_user } from '../drizzle/auth-schema';
import { devices } from './inventory';
import type { EnrichedScanResultSummary } from '../types/cve-enrichment';

export const scanRuns = sqliteTable('scan_runs', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // Restate workflow info (merged from scan_workflows)
  restateWorkflowId: text('restate_workflow_id').notNull(), // e.g., "portscan-0-0-0-0-123456"
  workflowKind: text('workflow_kind').notNull(), // 'EXTEND_SCAN', 'RESCAN', 'DISCOVERY', 'BULK_IMPORT', 'SYNC_QUALYS'
  workflowStatus: text('workflow_status').notNull().default('PENDING'), // 'PENDING', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'
  workflowStartedAt: integer('workflow_started_at', { mode: 'timestamp_ms' }),
  workflowFinishedAt: integer('workflow_finished_at', { mode: 'timestamp_ms' }),
  workflowCancelRequestedAt: integer('workflow_cancel_requested_at', { mode: 'timestamp_ms' }),
  workflowMetadata: text('workflow_metadata', { mode: 'json' }).$type<Record<string, any>>(),

  // Scan execution info
  scope: text('scope').notNull(), // 'INTERNAL', 'EXTERNAL', 'HYBRID'
  scanType: text('scan_type').notNull(), // 'DISCOVERY', 'PORT', 'WEB', 'ADVANCED'
  target: text('target'), // Primary target being scanned
  requestedById: text('requested_by_id').references(() => auth_user.id),
  requestedAt: now(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  status: text('status').notNull().default('PENDING'), // Execution result: 'PENDING', 'RUNNING', 'PARTIAL', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'
  resultSummary: text('result_summary', { mode: 'json' }).$type<EnrichedScanResultSummary | null>(),
}, (t) => ({
  orgStatusIdx: index('scan_runs_org_status_idx').on(t.organizationId, t.status),
  restateWorkflowIdUq: uniqueIndex('scan_runs_org_restate_workflow_id_uq').on(t.organizationId, t.restateWorkflowId),
}));

export const scanRunDevices = sqliteTable('scan_run_devices', {
  runId: text('run_id').notNull().references(() => scanRuns.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
}, (t) => ({
  pk: primaryKey({ columns: [t.runId, t.deviceId] }),
  orgIdx: index('scan_run_devices_org_idx').on(t.organizationId),
}));

export const scanSchedules = sqliteTable('scan_schedules', {
  id: cuidText().primaryKey(),
  scheduleId: text('schedule_id').notNull().unique(),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }).unique(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  interval: text('interval').notNull().default('1h'),
  isActive: integer('is_active', { mode: 'timestamp_ms' }),
  createdAt: now(),
}, (t) => ({
  orgIdx: index('scan_schedules_org_idx').on(t.organizationId),
  deviceIdx: index('scan_schedules_device_idx').on(t.deviceId),
  scheduleIdUq: uniqueIndex('scan_schedules_schedule_id_uq').on(t.scheduleId),
}));

// Relations
export const scanRunsRelations = relations(scanRuns, ({ one, many }) => ({
  organization: one(organization, {
    fields: [scanRuns.organizationId],
    references: [organization.id],
  }),
  requestedBy: one(auth_user, {
    fields: [scanRuns.requestedById],
    references: [auth_user.id],
  }),
  scanRunDevices: many(scanRunDevices),
}));

export const scanRunDevicesRelations = relations(scanRunDevices, ({ one }) => ({
  run: one(scanRuns, {
    fields: [scanRunDevices.runId],
    references: [scanRuns.id],
  }),
  device: one(devices, {
    fields: [scanRunDevices.deviceId],
    references: [devices.id],
  }),
  organization: one(organization, {
    fields: [scanRunDevices.organizationId],
    references: [organization.id],
  }),
}));

export const scanSchedulesRelations = relations(scanSchedules, ({ one }) => ({
  device: one(devices, {
    fields: [scanSchedules.deviceId],
    references: [devices.id],
  }),
  organization: one(organization, {
    fields: [scanSchedules.organizationId],
    references: [organization.id],
  }),
}));
