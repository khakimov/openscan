import type {
  AuthScanType,
  PortScanMode,
  PortScanResult,
  ScanPriority,
  ScanProfile,
  ScanScope,
  ScanTarget,
  TargetType,
} from "./schemas";

/**
 * Common structures used by workflows and activities
 */
export interface DiscoveredDevice {
  scope: ScanScope;
  discoveredAt: Date;
  hostname: string;
  ipAddress?: string;
  discoveryMethod: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface ScannerInputTarget extends ScanTarget {
  scope: ScanScope;
  seedPorts?: number[];
  historicPorts?: number[];
}

export interface ScannerInput {
  tenantId: string;
  userId: string;
  scanRunId: string;
  scanId: string; // Restate workflow key
  scanName?: string;
  isExtendScan: boolean;
  authScanType: AuthScanType;
  priority: ScanPriority;
  targets: Array<ScannerInputTarget>;
  authenticationConfig?: {
    credentials?: Record<string, unknown>;
  };
  scanOptions?: {
    skipPingSweep?: boolean;
    mode?: PortScanMode;
    profile?: ScanProfile;
    requestedPorts?: number[];
    seedPorts?: number[];
    historicPorts?: number[];
    aggressive?: boolean;
    additionalPortRanges?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface ScannerOutput {
  devices: DiscoveredDevice[];
  tenantId: string;
  scanId: string; // Restate workflow key
  scanRunId: string;
  executedAt: Date;
  executionTimeMs: number;
  errors?: string[];
  metadata?: Record<string, unknown>;
  performance?: {
    executionTimeMs: number;
    activitiesExecuted: number;
  };
}

export interface WorkflowStatusUpdate {
  scanId: string; // Restate workflow key
  tenantId?: string;
  scanRunId?: string;
  status: "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "RUNNING";
  phase?: string;
  progress?: number | { current: number; total: number; message?: string };
  message?: string;
  timestamp?: Date;
  error?: string | { code: string; message: string; details?: unknown };
  metadata?: Record<string, unknown>;
}

export interface PortScanConfig {
  ports?: number[];
  protocol: "tcp" | "udp" | "both";
  timeout: number;
  aggressive?: boolean;
  mode?: PortScanMode;
  profile?: ScanProfile;
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

export interface PortScanRequestTarget {
  type: Extract<TargetType, "IP_ADDRESS" | "SUBNET" | "DOMAIN" | "URL">;
  value: string;
  deviceId?: string;
  seedPorts?: number[];
  historicPorts?: number[];
}

export interface PortScanRequest extends PortScanConfig {
  tenantId: string;
  scanId: string;
  scanName?: string;
  targets: PortScanRequestTarget[];
  enableServiceDetection?: boolean;
  enableOSDetection?: boolean;
  aggressiveMode?: boolean;
  createdAt: Date;
}

export interface DiscoveryConfig {
  tools: string[];
  depth?: number;
  aggressive?: boolean;
}

export interface DiscoveryOutput {
  devices: DiscoveredDevice[];
  scanId: string; // Restate workflow key
  executedAt: Date;
  executionTimeMs: number;
  errors?: string[];
  metadata?: Record<string, unknown>;
  performance?: {
    executionTimeMs: number;
    activitiesExecuted: number;
  };
}

export interface WorkflowStatus {
  status: "STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  phase?: string;
  progress?: number;
  message?: string;
}

export interface PortScanSummary {
  target: {
    deviceId?: string;
    ipAddress: string;
    hostname?: string;
  };
  ports: PortScanResult[];
  scanStats: {
    totalPorts: number;
    openPorts: number;
    filteredPorts: number;
    closedPorts: number;
  };
}

export interface WebScanTarget {
  type: Extract<TargetType, "URL" | "IP_ADDRESS">;
  value: string;
  port?: number;
  deviceId?: string;
}

export interface WebScanInput {
  tenantId: string;
  scanId: string;
  scanName?: string;
  targets: WebScanTarget[];
  enableScreenshots: boolean;
  enableTechnologyDetection: boolean;
  followRedirects: boolean;
  timeout: number;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AdvancedScanTarget {
  type: Extract<TargetType, "IP_ADDRESS" | "DOMAIN" | "URL">;
  value: string;
  deviceId?: string;
}

export interface AdvancedScanInput {
  tenantId: string;
  scanId: string;
  scanName?: string;
  targets: AdvancedScanTarget[];
  scanProfiles: string[];
  enableCredentialChecks: boolean;
  enableWebAppTesting: boolean;
  maxSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  excludeRules: string[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface WebAppResult {
  url: string;
  title?: string;
  statusCode: number;
  technologies?: string[];
  isAvailable: boolean;
  target: {
    deviceId?: string;
  };
  vulnerabilities?: Array<{
    type: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    description: string;
  }>;
}

export type {
  AuthScanType,
  ScanPriority,
  ScanScope,
  ScanTarget,
  TargetType,
} from "./schemas";
