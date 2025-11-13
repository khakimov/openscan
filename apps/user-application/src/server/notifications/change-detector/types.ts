/**
 * Change Detector Types
 *
 * Shared type definitions for the change detection system.
 */

export interface ScanChange {
  type: 'NEW_PORT' | 'CLOSED_PORT' | 'NEW_CVE' | 'CVE_SEVERITY_INCREASE' | 'CVE_FIXED' | 'CVE_REGRESSED' | 'SERVICE_DRIFT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  module: 'NETWORK_SECURITY' | 'VULNERABILITY_MANAGEMENT' | 'GENERAL';
  title: string;
  message?: string;
  data: Record<string, any>;
  fingerprint: string;
}

export interface CVEInfo {
  cveId: string;
  severity: string;
  cvssScore: number;
  description?: string;
  affectedService?: string;
  port?: number;
}
