/**
 * Port Scan Workflow Contracts
 *
 * Database-agnostic contracts for port scanning workflows.
 * Worker executes scans and returns results without persistence.
 */

import type { ScanScope } from './common';

export type AuthScanType = 'ANONYMOUS' | 'AUTHENTICATED';
export type PortScanMode = 'DISCOVERY' | 'EXTEND' | 'UPTIME';
export type ScanProfile = 'PS_L1' | 'PS_L2' | 'PS_L3' | 'PS_L4' | 'PS_L5' | 'PS_L6';
export type PortProtocol = 'tcp' | 'udp';
export type PortState = 'open' | 'closed' | 'filtered';

/**
 * Input for port scan workflow
 */
export interface PortScanInput {
  // Required fields
  scanId: string;
  target: string; // IP address or domain

  // Scan configuration
  mode?: PortScanMode;
  profile?: ScanProfile;
  scope?: ScanScope;
  authScanType?: AuthScanType;

  // Port hints (from historic data, user input, etc.)
  requestedPorts?: number[];
  seedPorts?: number[]; // Ports known to be open from previous scans
  historicPorts?: number[]; // Ports from historical data
  additionalPortRanges?: string[]; // e.g., ["1-1000", "8000-9000"]

  // Scan behavior
  aggressive?: boolean;
  timeout?: number;

  // Optional metadata
  deviceId?: string;
  isExtendScan?: boolean;
  createdAt?: Date;
}

/**
 * Service information detected on a port
 */
export interface ServiceInfo {
  name?: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  method?: string;
  confidence?: number;
}

/**
 * A discovered port with service information
 */
export interface DiscoveredPort {
  port: number;
  protocol: PortProtocol;
  state: PortState;
  service?: ServiceInfo;
  discoveredBy?: string[]; // e.g., ["masscan", "nmap"]
  firstSeen?: number; // timestamp
  lastSeen?: number; // timestamp
}

/**
 * Operating system detection result
 */
export interface OSMatch {
  name: string;
  type: string;
  family: string;
  vendor: string;
  accuracy: number;
  generation?: string;
}

/**
 * Scan metadata and statistics
 */
export interface ScanMetadata {
  scanner: string; // e.g., "nmap"
  version: string;
  command?: string;
  startTime: number;
  endTime: number;
  duration: number; // milliseconds
  resolvedTarget?: string; // IP if target was domain
}

/**
 * Scan execution statistics
 */
export interface ScanStatistics {
  tcpPorts: number;
  udpPorts: number;
  openPorts: number;
  closedPorts: number;
  filteredPorts: number;
  totalPorts: number;
  servicesIdentified: number;
  servicesWithVersion: number;
}

/**
 * Quality metrics for scan results
 */
export interface ScanQuality {
  hasRetries: boolean;
  isRealTime: boolean;
  hasTimeouts: boolean;
  scanReliability: number; // 0-1
  dataCompleteness: number; // 0-1
  hasFilteredPorts: boolean;
}

/**
 * Output from port scan workflow
 * Worker returns this - web app decides what to persist
 */
export interface PortScanOutput {
  scanId: string;
  target: string;

  // Discovered ports
  ports: DiscoveredPort[];
  totalPorts: number;

  // OS detection
  osInfo?: OSMatch[];

  // Scan execution details
  metadata: ScanMetadata;
  statistics: ScanStatistics;
  quality?: ScanQuality;

  // Timing
  startedAt: Date;
  completedAt: Date;

  // Errors (non-fatal)
  errors: string[];

  // Performance metrics
  performance?: {
    executionTimeMs: number;
    portsPerSecond: number;
  };
}
