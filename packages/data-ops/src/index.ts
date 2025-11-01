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

// Explicitly export device creation schemas and types for visibility
export {
  CreateDevicesInProjectSchema,
  CreateDevicesFromDiscoverySchema,
  createDevicesInProject,
  type CreateDevicesInProjectInput,
  type CreateDevicesFromDiscoveryInput,
} from './queries/devices';

export * from './queries/scans';
export * from './queries/projects';
export * from './queries/organizations';
export * from './queries/scan-artifacts';

// Explicitly re-export getDeviceByIdGlobal (internal use only)
export { getDeviceByIdGlobal } from './queries/devices';

// Export CVE enrichment types & schemas (schema-first pattern)
export type {
  CVESeverity,
  CVEDetail,
  OSVulnerabilities,
  ApplicationVulnerabilities,
  CVESummary,
  CVEEnrichment,
  PortScanService,
  PortScanPort,
  PortScanOSInfo,
  PortScanTiming,
  PortScanMetadata,
  EnrichedScanResultSummary,
  CVEEnrichmentSizeGuards,
} from './types/cve-enrichment';

// Export Zod schemas for runtime validation
export {
  CVESeveritySchema,
  CVEDetailSchema,
  OSVulnerabilitiesSchema,
  ApplicationVulnerabilitiesSchema,
  CVESummarySchema,
  CVEEnrichmentSchema,
} from './types/cve-enrichment';

// Export helper functions
export {
  DEFAULT_SIZE_GUARDS,
  calculateSeverity,
  truncateDescription,
  calculateEnrichmentSize,
  applySizeGuards,
  validateEnrichmentSize,
  validateCVEEnrichment,
  safeParseCVEEnrichment,
} from './types/cve-enrichment';
