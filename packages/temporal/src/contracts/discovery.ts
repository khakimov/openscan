/**
 * Discovery Workflow Contracts
 *
 * These types define the interface between the Temporal worker and clients.
 * The worker implements these contracts and returns results through Temporal.
 * No database dependencies - worker is stateless and returns complete results.
 */

// ============================================================================
// Enums and Constants
// ============================================================================

export type TargetType =
  | 'DOMAIN'
  | 'IP_ADDRESS'
  | 'SUBNET'
  | 'URL'
  | 'IP_RANGE'
  | 'EMAIL';

export type ScanScope = 'INTERNAL' | 'EXTERNAL' | 'UNKNOWN';

export type DiscoveryPhase =
  | 'VALIDATING'
  | 'DISCOVERING'
  | 'PING_SWEEP'
  | 'COMPLETED'
  | 'FAILED';

// ============================================================================
// Target Structures
// ============================================================================

/**
 * A target to be scanned during discovery
 */
export interface ScanTarget {
  type: TargetType;
  value: string;
  scope: ScanScope;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Discovery Input (Request)
// ============================================================================

/**
 * Input for discovery workflow
 * Supports both simple (single domain) and advanced (multiple targets) discovery
 */
export interface DiscoveryInput {
  // Identification (not used for persistence by worker)
  tenantId: string;
  scanId: string;
  scanName?: string;

  // Targets to discover
  targets: ScanTarget[];

  // Discovery options
  discoverSubdomains: boolean;
  enablePingSweep: boolean;
  maxDepth: number;
  tools: string[];

  // Metadata
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Legacy format for backward compatibility with HTTP API
 * Used by web app when calling via temporal-http-client
 */
export interface DiscoveryRequest {
  target: string; // Single domain
  tools?: string[];
}

// ============================================================================
// Discovered Devices (Output Items)
// ============================================================================

/**
 * A device discovered during the discovery workflow
 * Worker returns these - client decides what to persist
 */
export interface DiscoveredDevice {
  scope: ScanScope;
  hostname: string;
  ipAddress?: string;
  discoveredAt: Date;
  discoveryMethod: string;
  confidence: number;
  metadata?: {
    originalTarget?: ScanTarget;
    subdomainOf?: string;
    resolvedFrom?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Discovery Output (Response)
// ============================================================================

/**
 * Output from discovery workflow
 * Complete result set returned by worker through Temporal
 */
export interface DiscoveryOutput {
  // Identification
  scanId: string;

  // Results
  devices: DiscoveredDevice[];
  pingSweepResults?: Record<string, boolean>;

  // Backward compatibility
  subdomains?: string[];

  // Execution metadata
  startedAt: Date;
  completedAt: Date;
  totalTargetsProcessed: number;
  errors: string[];

  // Performance stats
  performance?: {
    executionTimeMs: number;
    devicesPerSecond: number;
  };
}

// ============================================================================
// Workflow State (for queries)
// ============================================================================

/**
 * Internal workflow state for progress tracking
 * Queryable during workflow execution
 */
export interface DiscoveryWorkflowState {
  phase: DiscoveryPhase;
  totalTargets: number;
  processedTargets: number;
  devicesFound: number;
  errors: string[];
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Internal context passed to activities
 * Worker-specific, not exposed to clients
 */
export interface DiscoveryContext {
  workflowId: string;
  scanId: string;
  tenantId: string;
}
