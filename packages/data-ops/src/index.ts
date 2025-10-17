// Export all schema tables and types
export * from './schema';

// Export additional type helpers from types.ts (non-conflicting types)
export type {
  Project,
  NewProject,
  Device,
  NewDevice,
  DeviceIp,
  NewDeviceIp,
  Tag,
  NewTag,
  DeviceTag,
  Application,
  Scanner,
  NewScanner,
  ScanWorkflow,
  NewScanWorkflow,
  ScanRun,
  NewScanRun,
  ScanRunDevice,
  ScanSchedule,
  OrganizationMember,
} from './types';

// Export drizzle-orm operators for use in queries
export { eq, and, or, desc, asc, inArray, sql, lt, gt, gte, lte, ne, isNull, isNotNull, type SQL } from 'drizzle-orm';

// Export database client
export * from './database/setup';

// Export auth
export * from './auth/setup';

// Export queries
export * from './queries/devices';
export * from './queries/scans';
export * from './queries/projects';

// Explicitly re-export getDeviceByIdGlobal (internal use only)
export { getDeviceByIdGlobal } from './queries/devices';
