import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { cuidText, now, updatedAt } from './utils';
import { organization } from './identity';

export const scanners = sqliteTable('scanners', {
  id: cuidText().primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'CLOUD_SHARED', 'TENANT_DEDICATED', 'APPLIANCE', 'EMBEDDED_AGENT'
  status: text('status').notNull().default('REGISTERING'), // 'REGISTERING', 'READY', 'BUSY', 'DEGRADED', 'UNAVAILABLE', 'RETIRED'
  capabilities: text('capabilities', { mode: 'json' }).$type<string[]>(),
  lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp_ms' }),
  createdAt: now(),
  updatedAt: updatedAt(),
}, (t) => ({
  orgStatusIdx: index('scanners_org_status_idx').on(t.organizationId, t.status),
}));

export const scannersRelations = relations(scanners, ({ one }) => ({
  organization: one(organization, {
    fields: [scanners.organizationId],
    references: [organization.id],
  }),
}));
