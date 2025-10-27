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
}));

export const httpxProbes = sqliteTable('httpx_probes', {
  id: cuidText().primaryKey(),
  artifactId: text('artifact_id').notNull().unique().references(() => scanArtifacts.id, { onDelete: 'cascade' }),
  scheme: text('scheme'), // 'http', 'https'
  statusCode: integer('status_code'),
  title: text('title'),
  screenshot: text('screenshot'), // R2 object key
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),
  responseTime: integer('response_time'), // milliseconds
  contentLength: integer('content_length'),
  finalUrl: text('final_url'),
  tlsVersion: text('tls_version'),
  webServer: text('web_server'),
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
