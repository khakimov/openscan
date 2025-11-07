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
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // Scheduling config
  intervalConfig: text('interval_config', { mode: 'json' }).notNull().$type<{
    kind: 'duration' | 'daily';
    value?: number;
    unit?: 'minutes' | 'hours' | 'days';
    hour?: number;
    minute?: number;
    timezone?: string;
  }>(),
  interval: text('interval').notNull().default('1d'), // Cached label for UI ("Every 12 hours")
  preset: text('preset').notNull().default('STANDARD'), // "QUICK", "STANDARD", "THOROUGH"
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  // Execution tracking
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  lastRunStatus: text('last_run_status'), // "SUCCESS", "FAILED", "PARTIAL"
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),

  // Status and lifecycle
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE', 'PAUSED', 'AUTO_PAUSED', 'DELETED'
  pausedAt: integer('paused_at', { mode: 'timestamp_ms' }),
  pausedBy: text('paused_by').references(() => auth_user.id),
  pausedReason: text('paused_reason'),

  // Audit trail
  createdAt: now(),
  createdBy: text('created_by').references(() => auth_user.id),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
}, (t) => ({
  orgIdx: index('scan_schedules_org_idx').on(t.organizationId),
  deviceIdx: index('scan_schedules_device_idx').on(t.deviceId),
  scheduleIdUq: uniqueIndex('scan_schedules_schedule_id_uq').on(t.scheduleId),
  nextRunIdx: index('scan_schedules_next_run_idx').on(t.nextRunAt, t.isActive),
  statusIdx: index('scan_schedules_status_idx').on(t.status),
}));

// Scan Schedule Leases - Concurrency control
export const scanScheduleLeases = sqliteTable('scan_schedule_leases', {
  id: cuidText().primaryKey(),
  leaseId: text('lease_id').notNull().unique(), // UUID for external reference
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  scheduleId: text('schedule_id').notNull().references(() => scanSchedules.scheduleId, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  preset: text('preset').notNull(), // "QUICK", "STANDARD", "THOROUGH"
  acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => ({
  orgIdx: index('scan_schedule_leases_org_idx').on(t.organizationId),
  expiresAtIdx: index('scan_schedule_leases_expires_at_idx').on(t.expiresAt),
  scheduleIdx: index('scan_schedule_leases_schedule_idx').on(t.scheduleId),
}));

// Scan Schedule Events - Audit trail
export const scanScheduleEvents = sqliteTable('scan_schedule_events', {
  id: cuidText().primaryKey(),
  scheduleId: text('schedule_id').notNull().references(() => scanSchedules.scheduleId, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'CREATED', 'PAUSED', 'RESUMED', 'AUTO_PAUSED', 'DELETED', 'UPDATED'
  performedBy: text('performed_by').references(() => auth_user.id), // null for system events
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: now(),
}, (t) => ({
  scheduleIdx: index('scan_schedule_events_schedule_idx').on(t.scheduleId),
  orgIdx: index('scan_schedule_events_org_idx').on(t.organizationId),
  typeIdx: index('scan_schedule_events_type_idx').on(t.type),
  createdAtIdx: index('scan_schedule_events_created_at_idx').on(t.createdAt),
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

export const scanSchedulesRelations = relations(scanSchedules, ({ one, many }) => ({
  device: one(devices, {
    fields: [scanSchedules.deviceId],
    references: [devices.id],
  }),
  organization: one(organization, {
    fields: [scanSchedules.organizationId],
    references: [organization.id],
  }),
  createdByUser: one(auth_user, {
    fields: [scanSchedules.createdBy],
    references: [auth_user.id],
  }),
  pausedByUser: one(auth_user, {
    fields: [scanSchedules.pausedBy],
    references: [auth_user.id],
  }),
  events: many(scanScheduleEvents),
  leases: many(scanScheduleLeases),
}));

export const scanScheduleLeasesRelations = relations(scanScheduleLeases, ({ one }) => ({
  organization: one(organization, {
    fields: [scanScheduleLeases.organizationId],
    references: [organization.id],
  }),
  schedule: one(scanSchedules, {
    fields: [scanScheduleLeases.scheduleId],
    references: [scanSchedules.scheduleId],
  }),
  device: one(devices, {
    fields: [scanScheduleLeases.deviceId],
    references: [devices.id],
  }),
}));

export const scanScheduleEventsRelations = relations(scanScheduleEvents, ({ one }) => ({
  schedule: one(scanSchedules, {
    fields: [scanScheduleEvents.scheduleId],
    references: [scanSchedules.scheduleId],
  }),
  organization: one(organization, {
    fields: [scanScheduleEvents.organizationId],
    references: [organization.id],
  }),
  performedByUser: one(auth_user, {
    fields: [scanScheduleEvents.performedBy],
    references: [auth_user.id],
  }),
}));

// Scan Artifacts - HTTPx Integration
export const scanArtifacts = sqliteTable('scan_artifacts', {
  id: cuidText().primaryKey(),
  scanRunId: text('scan_run_id').notNull().references(() => scanRuns.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(), // 'httpx', 'zap', 'nikto'
  port: integer('port'),
  status: text('status').notNull(), // 'pending', 'running', 'completed', 'failed'
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  errorMessage: text('error_message'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: now(),
}, (t) => ({
  scanRunIdx: index('scan_artifacts_scan_run_idx').on(t.scanRunId),
  deviceIdx: index('scan_artifacts_device_idx').on(t.deviceId),
  orgIdx: index('scan_artifacts_org_idx').on(t.organizationId),
  deviceOrgIdx: index('scan_artifacts_device_org_idx').on(t.deviceId, t.organizationId),
  statusIdx: index('scan_artifacts_status_idx').on(t.status),
  toolNameIdx: index('scan_artifacts_tool_name_idx').on(t.toolName),
  portIdx: index('scan_artifacts_port_idx').on(t.port),
  // Idempotency constraint: prevents duplicate artifacts from Restate retries
  idempotencyUq: uniqueIndex('scan_artifacts_idempotency_uq').on(t.deviceId, t.port, t.scanRunId, t.toolName),
}));

export const httpxProbes = sqliteTable('httpx_probes', {
  id: cuidText().primaryKey(),
  artifactId: text('artifact_id').notNull().unique().references(() => scanArtifacts.id, { onDelete: 'cascade' }),

  // Typed columns: frequently queried or displayed in UI
  scheme: text('scheme'), // 'http', 'https' - used in filters
  statusCode: integer('status_code'), // used in WHERE clauses
  title: text('title'), // displayed in UI list
  screenshot: text('screenshot'), // R2 object key - critical path
  responseTime: integer('response_time'), // milliseconds - performance metrics
  webServer: text('web_server'), // used for tech detection queries

  // Low-value fields moved to metadata JSON (headers, tlsVersion, contentLength, finalUrl)
  metadata: text('metadata', { mode: 'json' }).$type<{
    headers?: Record<string, string>;
    tlsVersion?: string;
    contentLength?: number;
    finalUrl?: string;
    [key: string]: any;
  }>(),

  createdAt: now(),
}, (t) => ({
  artifactIdx: index('httpx_probes_artifact_idx').on(t.artifactId),
  statusCodeIdx: index('httpx_probes_status_code_idx').on(t.statusCode),
}));

export const technologies = sqliteTable('technologies', {
  id: cuidText().primaryKey(),
  name: text('name').notNull().unique(), // 'nginx', 'react', 'wordpress' (normalized lowercase)
  category: text('category'), // 'web-server', 'framework', 'database', 'cms'
  createdAt: now(),
}, (t) => ({
  nameIdx: index('technologies_name_idx').on(t.name),
  categoryIdx: index('technologies_category_idx').on(t.category),
}));

export const httpxTechDetections = sqliteTable('httpx_tech_detections', {
  id: cuidText().primaryKey(),
  probeId: text('probe_id').notNull().references(() => httpxProbes.id, { onDelete: 'cascade' }),
  technologyId: text('technology_id').notNull().references(() => technologies.id, { onDelete: 'restrict' }),
  confidence: text('confidence'), // 'high', 'medium', 'low'
  version: text('version'),
  createdAt: now(),
}, (t) => ({
  probeIdx: index('httpx_tech_detections_probe_idx').on(t.probeId),
  techIdx: index('httpx_tech_detections_tech_idx').on(t.technologyId),
  probeTechUq: uniqueIndex('httpx_tech_detections_probe_tech_idx').on(t.probeId, t.technologyId),
}));

// Scan Artifacts Relations
export const scanArtifactsRelations = relations(scanArtifacts, ({ one, many }) => ({
  scanRun: one(scanRuns, {
    fields: [scanArtifacts.scanRunId],
    references: [scanRuns.id],
  }),
  device: one(devices, {
    fields: [scanArtifacts.deviceId],
    references: [devices.id],
  }),
  organization: one(organization, {
    fields: [scanArtifacts.organizationId],
    references: [organization.id],
  }),
  httpxProbe: one(httpxProbes),
}));

export const httpxProbesRelations = relations(httpxProbes, ({ one, many }) => ({
  artifact: one(scanArtifacts, {
    fields: [httpxProbes.artifactId],
    references: [scanArtifacts.id],
  }),
  techDetections: many(httpxTechDetections),
}));

export const technologiesRelations = relations(technologies, ({ many }) => ({
  detections: many(httpxTechDetections),
}));

export const httpxTechDetectionsRelations = relations(httpxTechDetections, ({ one }) => ({
  probe: one(httpxProbes, {
    fields: [httpxTechDetections.probeId],
    references: [httpxProbes.id],
  }),
  technology: one(technologies, {
    fields: [httpxTechDetections.technologyId],
    references: [technologies.id],
  }),
}));
