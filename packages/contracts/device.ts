import type { PortSnapshot, PortScanStats } from './port';
import type { Result, ResultWithMessage } from './result';

/**
 * Device domain types - shared across UI, workers, and data-ops
 * Single source of truth for device representations
 */

/**
 * Service Detection Filtering Rules
 *
 * These heuristics prevent low-quality/noisy port detections from polluting
 * the database and confusing analysts.
 */

/**
 * Low-confidence service names that should be filtered out
 *
 * - tcpwrapped: Generic wrapper, provides no useful info
 * - unknown: No detection at all
 * - jetdirect: HP printer protocol, rarely useful
 */
export const LOW_CONFIDENCE_SERVICE_NAMES = new Set([
  'tcpwrapped',
  'unknown',
  'jetdirect',
]);

/**
 * Top 20 most common ports where we want ALL detections
 * Even low-confidence ones might be useful on standard ports
 */
export const TOP_20_PORTS = new Set([
  21,   // FTP
  22,   // SSH
  23,   // Telnet
  25,   // SMTP
  53,   // DNS
  80,   // HTTP
  110,  // POP3
  143,  // IMAP
  443,  // HTTPS
  445,  // SMB
  3306, // MySQL
  3389, // RDP
  5432, // PostgreSQL
  5900, // VNC
  6379, // Redis
  8080, // HTTP Alt
  8443, // HTTPS Alt
  27017, // MongoDB
  1433, // MSSQL
  5672, // RabbitMQ
]);

/**
 * Standard HTTPS ports where we trust service detection
 */
export const STANDARD_HTTPS_PORTS = new Set([443, 8443]);

/**
 * Service detection type from postback/worker
 */
export interface ServiceDetection {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: {
    name?: string;
    product?: string | null;
    version?: string | null;
    extraInfo?: string | null;
    method?: string;
    confidence?: number;
  };
}

/**
 * Determine if a service detection should be discarded
 *
 * Rules:
 * 1. Discard if port is not open
 * 2. Discard low-confidence names (tcpwrapped, unknown, jetdirect) on non-standard ports
 * 3. Discard Incapsula CDN on non-HTTPS ports (likely misdetection)
 *
 * @param det - Service detection from Nmap
 * @returns true if detection should be filtered out
 */
export function shouldDiscardServiceDetection(det: ServiceDetection): boolean {
  // Only keep open ports
  if (det.state !== 'open') {
    return true;
  }

  // No service data = keep (we at least know the port is open)
  if (!det.service) {
    return false;
  }

  const serviceName = det.service.name?.toLowerCase();
  const product = det.service.product?.toLowerCase();

  // Filter low-confidence service names on non-standard ports
  if (serviceName && LOW_CONFIDENCE_SERVICE_NAMES.has(serviceName)) {
    // Keep if it's a top 20 port (might still be useful)
    if (TOP_20_PORTS.has(det.port)) {
      return false;
    }
    return true;
  }

  // Filter Incapsula CDN misdetections on non-HTTPS ports
  if (product?.includes('incapsula') && !STANDARD_HTTPS_PORTS.has(det.port)) {
    return true;
  }

  // Keep everything else
  return false;
}

/**
 * Transformed device type with UI-friendly properties.
 * Returned by transformDeviceForUI and used throughout the UI.
 *
 * Single source of truth: portSnapshots[] contains all port data with enrichment.
 *
 * @remarks
 * Date fields (discoveredOn, lastScanned, verifiedAt) are ISO 8601 strings.
 * After superjson hydration in React Query, these may be Date objects.
 * Always use defensive checks: `new Date(device.discoveredOn)` when needed.
 */
export type TransformedDevice = {
  id: string;
  name: string;
  ip: string;
  riskLevel: string;
  status: 'active' | 'offline';
  discoveredOn: string;
  lastScanned?: string;
  source: 'agentless' | 'agentbased';
  isScanned: boolean;
  scanType: 'scanned' | 'discovered';
  scope: 'internal' | 'external' | 'hybrid';
  tags: string[];
  respondsToICMPPing: boolean;
  notes: string;
  scanCount: number;
  totalOpenPorts: number;
  portSnapshots: PortSnapshot[];
  scanStats?: {
    scanCount: number;
    totalScans?: number;
    lastScanAt: string | null;
    portScanStats?: PortScanStats | null;
  };
  verificationStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNote: string | null;
  isVerified: boolean;
};

/**
 * Standard success/error response pattern for device operations
 * @deprecated Use Result<T> from './result' instead
 */
export type DeviceOperationResult<T = void> = Result<{ data?: T }>;

/**
 * Device list result type (used by tRPC device.list procedure)
 * Matches data-ops getDevicesForTenant return shape
 */
export type DevicesListResult = Result<{
  items: TransformedDevice[];
  totalCount: number;
  page: number;
  totalPages: number;
}>;

/**
 * getDeviceDetailData return type (single device)
 */
export type DeviceDetailResult = TransformedDevice;

/**
 * Device vulnerability type
 *
 * @remarks
 * Severity casing: lowercase here ('critical' | 'high' | 'medium' | 'low')
 * matches UI expectations. Data-ops may return uppercase; transform at the edge.
 */
export interface DeviceVulnerability {
  id: number;
  cve: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss_score: number;
  state: string;
  element_id: string;
}

/**
 * getDeviceVulnerabilitiesData return type
 */
export interface DeviceVulnerabilitiesResult {
  page: number;
  totalPages: number;
  totalCount: number;
  items: DeviceVulnerability[];
}

/**
 * deleteDevice return type
 */
export type DeleteDeviceResult = ResultWithMessage;

/**
 * getDiscoveryDevices return type
 */
export type DiscoveryDevicesResult = Result<{
  devices: Array<{
    id: string;
    name: string;
    ip: string | null;
  }>;
  count: number;
}>;

/**
 * createDevicesFromDiscovery return type
 */
export type CreateDevicesResult = Result<{
  devices: TransformedDevice[];
  count: number;
}>;

/**
 * updateDeviceData return type
 */
export type UpdateDeviceResult = Result<{
  device: TransformedDevice;
}>;

/**
 * verifyDevice return type
 */
export type VerifyDeviceResult = Result<{
  device: TransformedDevice;
}>;

/**
 * getDeviceScanHistoryData return type
 */
export type DeviceScanHistoryResult = Result<{
  history: Array<{
    id: string;
    requestedAt: any;
    resultSummary?: any;
  }>;
}>;

/**
 * toggleDeviceVerification return type
 */
export type ToggleDeviceVerificationResult = Result<{
  verified: boolean;
  message: string;
}>;

/**
 * startDeviceScan return type
 *
 * @remarks
 * Contains metadata even on failure (target, preset, presetDescription)
 * for error reporting purposes.
 */
export type StartDeviceScanResult =
  | ({
      success: true;
      error?: undefined;
    } & {
      scanId?: string;
      scanRunId?: string | number;
      preset: string;
      presetDescription: string;
      target: string;
      ports?: string[];
      totalPorts?: number;
      message?: string;
    })
  | ({
      success: false;
      error: string;
    } & {
      target: string;
      preset: string;
      presetDescription: string;
      scanId?: undefined;
      scanRunId?: undefined;
    });
