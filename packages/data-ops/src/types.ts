import * as schema from './schema';

// Project types
export type Project = typeof schema.projects.$inferSelect;
export type NewProject = typeof schema.projects.$inferInsert;

// Device types
export type Device = typeof schema.devices.$inferSelect;
export type NewDevice = typeof schema.devices.$inferInsert;
export type DeviceIp = typeof schema.deviceIps.$inferSelect;
export type NewDeviceIp = typeof schema.deviceIps.$inferInsert;
export type Tag = typeof schema.tags.$inferSelect;
export type NewTag = typeof schema.tags.$inferInsert;
export type DeviceTag = typeof schema.deviceTags.$inferSelect;
export type Application = typeof schema.applications.$inferSelect;

// Scanner types
export type Scanner = typeof schema.scanners.$inferSelect;
export type NewScanner = typeof schema.scanners.$inferInsert;

// Scan types
// ScanWorkflow types removed - workflow data is now embedded in ScanRun
export type ScanRun = typeof schema.scanRuns.$inferSelect;
export type NewScanRun = typeof schema.scanRuns.$inferInsert;
export type ScanRunDevice = typeof schema.scanRunDevices.$inferSelect;
export type ScanSchedule = typeof schema.scanSchedules.$inferSelect;

// Organization/Tenant types (from better-auth)
export type Organization = typeof schema.organization.$inferSelect;
export type OrganizationMember = typeof schema.organizationMember.$inferSelect;

// Backward compatibility: Tenant = Organization
export type Tenant = Organization;

// User types (from better-auth)
export type User = typeof schema.auth_user.$inferSelect;

// Re-export enums
export * from './schema/enums';
