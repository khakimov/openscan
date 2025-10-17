/**
 * Centralized type definitions for nmap XML parser
 * All TypeScript interfaces used across the parser modules
 */

import type { ServiceFingerprintMatch } from './utils';

/**
 * Service details parsed from nmap XML
 */
export interface ParsedServiceDetails {
  name?: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  method?: string;
  conf?: number;
  tunnel?: string;
  cpe?: string[];
  fingerprint?: string;
  fingerprintMatches?: ServiceFingerprintMatch[];
}

/**
 * Individual port information
 */
export interface ParsedPort {
  port: number;
  protocol: 'tcp' | 'udp'; // Transport protocol - MUST stay as tcp/udp for downstream processing
  state: 'open' | 'closed' | 'filtered';
  transportProtocol: 'tcp' | 'udp'; // Duplicate for backward compatibility
  service?: ParsedServiceDetails;
}

/**
 * OS match information with CPE strings
 */
export interface ParsedOsMatch {
  name: string;
  accuracy: number;
  line?: number;
  cpe: string[]; // Normalized CPE 2.3 strings
  osclass?: Array<{
    type?: string;
    vendor?: string;
    osfamily?: string;
    osgen?: string;
    accuracy?: number;
    cpe?: string[];
  }>;
}

/**
 * OS detection information
 */
export interface OsInfo {
  matches: ParsedOsMatch[];
  fingerprints?: any[];
}

/**
 * Host identification and status
 */
export interface ParsedHost {
  address: string;
  addressType: string;
  hostnames: string[];
  status: string;
  reason?: string;
}

/**
 * Complete host scan data
 */
export interface ParsedHostData {
  host: ParsedHost;
  scanData: ParsedPort[];
  osMatches: string[]; // Normalized CPE strings
  osInfo?: OsInfo;

  // Legacy compatibility - single host access
  ports: ParsedPort[];

  // Filtered port tracking for retry logic
  filteredPorts: {
    tcp: number[];
    udp: number[];
  };

  // Uptime-friendly format
  portStatusMap?: Record<number, { status: string }>;
}

/**
 * Timing information
 */
export interface TimingData {
  start: number;
  end: number;
  elapsed: number;
}

/**
 * Run statistics from nmap scan
 */
export interface RunStatsData {
  finished: {
    time: number;
    timeStr: string;
    summary: string;
    elapsed: number;
    exit: string;
  };
  hosts: {
    up: number;
    down: number;
    total: number;
  };
}

/**
 * Scan configuration information
 */
export interface ScanInfoData {
  type: string;
  protocol: string;
  numServices: number;
  services: string;
}

/**
 * Complete nmap scan result
 */
export interface ParsedNmapData {
  scanner: string;
  version: string;
  args: string;
  start: number;
  startStr: string;

  // Support both single and multi-host scans
  hosts: Record<string, ParsedHostData>;

  timing: TimingData;
  scanInfo?: ScanInfoData;
  runStats?: RunStatsData;
}

// Re-export ServiceFingerprintMatch for convenience
export type { ServiceFingerprintMatch };
