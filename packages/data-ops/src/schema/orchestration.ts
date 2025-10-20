import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { cuidText, now } from './utils';
import { organization } from './identity';
import { auth_user } from '../drizzle/auth-schema';
import { devices } from './inventory';
import type { EnrichedScanResultSummary } from '../types/cve-enrichment';

export const scanWorkflows = sqliteTable('scan_workflows', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'EXTEND_SCAN', 'RESCAN', 'DISCOVERY', 'BULK_IMPORT', 'SYNC_QUALYS'
  status: text('status').notNull().default('PENDING'), // 'PENDING', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'
  scanId: text('scan_id').notNull(), // Restate workflow key (e.g., "portscan-0-0-0-0-123456" or "discovery-123456")
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  cancelRequestedAt: integer('cancel_requested_at', { mode: 'timestamp_ms' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
}, (t) => ({
  orgStatusIdx: index('scan_workflows_org_status_idx').on(t.organizationId, t.status),
  statusStartedIdx: index('scan_workflows_status_started_idx').on(t.status, t.startedAt),
  orgScanIdUq: uniqueIndex('scan_workflows_org_scan_id_uq').on(t.organizationId, t.scanId),
}));

export const scanRuns = sqliteTable('scan_runs', {
  id: cuidText().primaryKey(),
  scanWorkflowId: text('scan_workflow_id').notNull().references(() => scanWorkflows.id, { onDelete: 'cascade' }), // Foreign key to scanWorkflows.id (CUID)
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), // 'INTERNAL', 'EXTERNAL', 'HYBRID'
  scanType: text('scan_type').notNull(), // 'DISCOVERY', 'PORT', 'WEB', 'ADVANCED'
  target: text('target'), // Primary target being scanned
  requestedById: text('requested_by_id').references(() => auth_user.id),
  requestedAt: now(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  status: text('status').notNull().default('PENDING'), // 'PENDING', 'RUNNING', 'PARTIAL', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'
  resultSummary: text('result_summary', { mode: 'json' }).$type<EnrichedScanResultSummary | null>(),
}, (t) => ({
  orgStatusIdx: index('scan_runs_org_status_idx').on(t.organizationId, t.status),
  scanWorkflowIdx: index('scan_runs_scan_workflow_idx').on(t.scanWorkflowId),
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
export const scanWorkflowsRelations = relations(scanWorkflows, ({ one, many }) => ({
  organization: one(organization, {
    fields: [scanWorkflows.organizationId],
    references: [organization.id],
  }),
  scanRuns: many(scanRuns),
}));

export const scanRunsRelations = relations(scanRuns, ({ one, many }) => ({
  workflow: one(scanWorkflows, {
    fields: [scanRuns.scanWorkflowId],
    references: [scanWorkflows.id],
  }),
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
