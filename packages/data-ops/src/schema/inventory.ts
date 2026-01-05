import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { cuidText, now, updatedAt } from './utils';
import { organization } from './identity';
import { auth_user } from '../drizzle/auth-schema';

export const projects = sqliteTable('projects', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  domain: text('domain'),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(sql`0`),
  createdAt: now(),
  updatedAt: updatedAt(),
}, (t) => ({
  orgIdx: index('projects_org_idx').on(t.organizationId),
  orgDefaultIdx: index('projects_org_default_idx').on(t.organizationId, t.isDefault),
}));

export const devices = sqliteTable('devices', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  source: text('source').notNull(),
  name: text('name').notNull(),
  scope: text('scope').notNull(), // 'INTERNAL', 'EXTERNAL', 'HYBRID'
  riskLevel: text('risk_level').notNull().default('SECURE'), // 'SECURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  isBillable: integer('is_billable', { mode: 'boolean' }).notNull().default(sql`0`),
  state: text('state').notNull().default('AVAILABLE'),
  isScanned: integer('is_scanned', { mode: 'boolean' }).notNull().default(sql`0`),
  respondsToPing: integer('responds_to_ping', { mode: 'boolean' }).notNull().default(sql`0`),
  verificationStatus: text('verification_status').notNull().default('CANDIDATE'), // 'CANDIDATE', 'VERIFIED', 'EXCLUDED'
  verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
  verifiedBy: text('verified_by').references(() => auth_user.id, { onDelete: 'set null' }),
  verificationNote: text('verification_note'),
  notes: text('notes'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  discoveredAt: now(),
  updatedAt: updatedAt(),
}, (t) => ({
  orgBillableIdx: index('devices_org_billable_idx').on(t.organizationId, t.isBillable),
  orgRiskIdx: index('devices_org_risk_idx').on(t.organizationId, t.riskLevel),
  orgStateIdx: index('devices_org_state_idx').on(t.organizationId, t.state),
  orgVerificationIdx: index('devices_org_verification_idx').on(t.organizationId, t.verificationStatus),
  orgProjectIdx: index('devices_org_project_idx').on(t.organizationId, t.projectId),
  projectIdx: index('devices_project_idx').on(t.projectId),
}));

export const deviceIps = sqliteTable('device_ips', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  ip: text('ip').notNull(),
  primary: integer('primary', { mode: 'boolean' }).notNull().default(sql`0`),
  lastScanned: integer('last_scanned', { mode: 'timestamp_ms' }),
  reverseDns: text('reverse_dns'),
}, (t) => ({
  orgIpIdx: index('device_ips_org_ip_idx').on(t.organizationId, t.ip),
  deviceIpUq: uniqueIndex('device_ips_device_ip_uq').on(t.organizationId, t.deviceId, t.ip),
}));

export const deviceHostnames = sqliteTable('device_hostnames', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  type: text('type').notNull().default('A'), // 'A' | 'PTR'
  source: text('source').notNull().default('DISCOVERY'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  createdAt: now(),
}, (t) => ({
  orgHostIdx: index('device_hostnames_org_host_idx').on(t.organizationId, t.hostname),
  uniqueIdx: uniqueIndex('device_hostnames_unique_idx').on(t.organizationId, t.deviceId, t.hostname, t.type),
}));

export const tags = sqliteTable('tags', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  description: text('description'),
  createdAt: now(),
}, (t) => ({
  orgNameUq: uniqueIndex('tags_org_name_uq').on(t.organizationId, t.name),
}));

export const deviceTags = sqliteTable('device_tags', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({
  orgTagIdx: index('device_tags_org_tag_idx').on(t.organizationId, t.tagId),
  uniqueIdx: uniqueIndex('device_tags_unique_idx').on(t.organizationId, t.deviceId, t.tagId),
}));

export const applications = sqliteTable('applications', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  deviceId: text('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: text('version'),
  vendor: text('vendor'),
  firstSeenAt: now(),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull().$onUpdate(() => new Date()),
}, (t) => ({
  orgNameIdx: index('applications_org_name_idx').on(t.organizationId, t.name),
}));

// Relations
export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organization, {
    fields: [projects.organizationId],
    references: [organization.id],
  }),
  devices: many(devices),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  organization: one(organization, {
    fields: [devices.organizationId],
    references: [organization.id],
  }),
  project: one(projects, {
    fields: [devices.projectId],
    references: [projects.id],
  }),
  deviceIps: many(deviceIps),
  deviceHostnames: many(deviceHostnames),
  deviceTags: many(deviceTags),
  applications: many(applications),
}));

export const deviceIpsRelations = relations(deviceIps, ({ one }) => ({
  organization: one(organization, {
    fields: [deviceIps.organizationId],
    references: [organization.id],
  }),
  device: one(devices, {
    fields: [deviceIps.deviceId],
    references: [devices.id],
  }),
}));

export const deviceHostnamesRelations = relations(deviceHostnames, ({ one }) => ({
  organization: one(organization, {
    fields: [deviceHostnames.organizationId],
    references: [organization.id],
  }),
  device: one(devices, {
    fields: [deviceHostnames.deviceId],
    references: [devices.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  organization: one(organization, {
    fields: [tags.organizationId],
    references: [organization.id],
  }),
  deviceTags: many(deviceTags),
}));

export const deviceTagsRelations = relations(deviceTags, ({ one }) => ({
  organization: one(organization, {
    fields: [deviceTags.organizationId],
    references: [organization.id],
  }),
  device: one(devices, {
    fields: [deviceTags.deviceId],
    references: [devices.id],
  }),
  tag: one(tags, {
    fields: [deviceTags.tagId],
    references: [tags.id],
  }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  organization: one(organization, {
    fields: [applications.organizationId],
    references: [organization.id],
  }),
  device: one(devices, {
    fields: [applications.deviceId],
    references: [devices.id],
  }),
}));
