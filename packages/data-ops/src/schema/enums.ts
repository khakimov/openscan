// SQLite doesn't support native enums, so we define them as const types
export const ROLES = ['ADMIN', 'ANALYST', 'READ_ONLY', 'SERVICE'] as const;
export type Role = typeof ROLES[number];

export const WORKFLOW_KINDS = ['EXTEND_SCAN', 'RESCAN', 'DISCOVERY', 'BULK_IMPORT', 'SYNC_QUALYS'] as const;
export type WorkflowKind = typeof WORKFLOW_KINDS[number];

export const WORKFLOW_STATUSES = ['PENDING', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'] as const;
export type WorkflowStatus = typeof WORKFLOW_STATUSES[number];

export const RUN_STATUSES = ['PENDING', 'RUNNING', 'PARTIAL', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'] as const;
export type RunStatus = typeof RUN_STATUSES[number];

export const WORKFLOW_STEP_STATUSES = ['WAITING', 'EXECUTING', 'COMPLETED', 'RETRYING', 'FAILED', 'TIMED_OUT'] as const;
export type WorkflowStepStatus = typeof WORKFLOW_STEP_STATUSES[number];

export const JOB_KINDS = ['SCAN_BULK_ADD', 'DEVICE_DELETE', 'EXPORT_DEVICES', 'REPORT_GENERATE'] as const;
export type JobKind = typeof JOB_KINDS[number];

export const JOB_STATUSES = ['QUEUED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMEOUT'] as const;
export type JobStatus = typeof JOB_STATUSES[number];

export const SCAN_SCOPES = ['INTERNAL', 'EXTERNAL', 'HYBRID'] as const;
export type ScanScope = typeof SCAN_SCOPES[number];

export const SCAN_TYPES = ['DISCOVERY', 'PORT', 'WEB', 'ADVANCED'] as const;
export type ScanType = typeof SCAN_TYPES[number];

export const RISK_LEVELS = ['SECURE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export const ACCESS_LEVELS = ['read', 'write', 'admin'] as const;
export type AccessLevel = typeof ACCESS_LEVELS[number];

export const CLIENT_TYPES = ['read', 'write', 'root'] as const;
export type ClientType = typeof CLIENT_TYPES[number];

export const SCANNER_KINDS = ['CLOUD_SHARED', 'TENANT_DEDICATED', 'APPLIANCE', 'EMBEDDED_AGENT'] as const;
export type ScannerKind = typeof SCANNER_KINDS[number];

export const SCANNER_STATUSES = ['REGISTERING', 'READY', 'BUSY', 'DEGRADED', 'UNAVAILABLE', 'RETIRED'] as const;
export type ScannerStatus = typeof SCANNER_STATUSES[number];

export const VERIFICATION_STATUSES = ['CANDIDATE', 'VERIFIED', 'EXCLUDED'] as const;
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];
