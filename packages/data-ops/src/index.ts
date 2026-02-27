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
export { getAuth, clearAuth, type AuthEnv } from './auth/server';

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

// Export DNS resolution and asset normalization
export {
  resolveTarget,
  upsertResolvedDevice,
  resolveAndUpsertTargets,
  type ResolutionResult,
  type ResolveOptions,
} from './queries/devices/resolution';

export * from './queries/scans';
// Explicitly export scan timeout functions for visibility
export {
  SCAN_TIMEOUT_MS,
  getStuckScans,
  markStuckScansAsTimeout,
  processScanTimeouts,
} from './queries/scans';
export * from './queries/projects';
export * from './queries/organizations';
export * from './queries/scan-artifacts';
export * from './queries/scan-schedules';
export * from './queries/scan-schedule-limits';
export * from './queries/notifications';

// Explicitly export notification query functions
export {
  getNotifications,
  getUnreadNotificationCount,
  getUnreadNotificationCountWithSeverity,
  getPendingEmailNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  upsertNotification,
  backfillMessageHashes,
  expireNotifications,
} from './queries/notifications';
export type { UpsertNotificationResult } from './queries/notifications';

// Export notification serializers for API responses
export {
  serializeNotification,
  serializeNotificationList,
  calculateNotificationStats,
  sortByPriorityAndTime,
  filterByReadStatus,
  filterBySeverity,
} from './queries/notification-serializers';
export type {
  SerializedNotification,
  SerializedNotificationList,
  NotificationStats,
} from './queries/notification-serializers';

// Export configuration drift notification functions
export {
  logConfigurationDrift,
  logServerIPChanged,
  logAppProductChanged,
  logAppVersionChanged,
  logWebTitleChanged,
  logManualEdit,
} from './queries/notifications/configuration';

// Explicitly re-export getDeviceByIdGlobal (internal use only)
export { getDeviceByIdGlobal } from './queries/devices';

// Export device counts query
export { getDeviceCounts } from './queries/devices';

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
  // sec-zg2: Port snapshot types
  PortSnapshot,
  PortEnrichmentSummary,
  PortScanStats,
} from './types/cve-enrichment';

// Export Zod schemas for runtime validation
export {
  CVESeveritySchema,
  CVEDetailSchema,
  OSVulnerabilitiesSchema,
  ApplicationVulnerabilitiesSchema,
  CVESummarySchema,
  CVEEnrichmentSchema,
  // sec-zg2: Port snapshot schemas
  PortEnrichmentSummarySchema,
  PortSnapshotSchema,
  PortScanStatsSchema,
  EnrichedScanResultSummarySchema,
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
  // sec-zg2: Port snapshot helpers
  buildPortEnrichmentMap,
  derivePortStats,
} from './types/cve-enrichment';

// Export notification catalog (sec-or9 refactor)
export * from './notifications/catalog';
export type { NotificationSeverity, NotificationType, NotificationModule } from './notifications/catalog';

// Export typed notification helpers (sec-g6o)
export * from './notifications/helpers';
export type {
  NotifyNewPortParams,
  NotifyClosedPortParams,
  NotifyNewCVEParams,
  NotifyCVESeverityIncreaseParams,
  NotifyCVEFixedParams,
  NotifyCVERegressedParams,
} from './notifications/helpers';
