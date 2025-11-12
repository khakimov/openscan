/**
 * Type definitions for discovery workflow server functions
 */

// Start discovery workflow result types
export interface DiscoveryWorkflowStartSuccess {
  success: true;
  scanId: string;
  scanRunId: number | string;
  target: string;
  message: string;
  error?: undefined;
}

export interface DiscoveryWorkflowStartError {
  success: false;
  scanId?: undefined;
  scanRunId?: undefined;
  target: string;
  error: string;
}

export type DiscoveryWorkflowStartResult =
  | DiscoveryWorkflowStartSuccess
  | DiscoveryWorkflowStartError;

// Discovery workflow status result types
export interface DiscoveryWorkflowStatusSuccess {
  scanId: string;
  status: string;
  workflowStatus?: string;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  devicesFound: number;
  processedTargets: number;
  error?: undefined;
}

export interface DiscoveryWorkflowStatusError {
  scanId: string;
  status: 'UNKNOWN';
  workflowStatus?: undefined;
  isRunning?: undefined;
  isCompleted?: undefined;
  isFailed?: undefined;
  devicesFound?: undefined;
  processedTargets?: undefined;
  error: string;
}

export type DiscoveryWorkflowStatusResult =
  | DiscoveryWorkflowStatusSuccess
  | DiscoveryWorkflowStatusError;

// Discovery workflow results types
export interface DiscoveryResultDevice {
  host: string;
  ip: string;
}

export interface DiscoveryWorkflowResultsSuccess {
  success: true;
  result: {
    request: {
      target: string;
      scanType: string;
      tools: string[];
    };
    results: Array<{
      target: string;
      subdomains: string[];
      results: DiscoveryResultDevice[];
      tool: string;
      timestamp: string;
      success: boolean;
      errors?: string[] | undefined;
    }>;
    totalSubdomains: number;
    uniqueSubdomains: Array<{
      subdomain: string;
      ip: string;
    }>;
    executionTime: number;
    errors?: string[] | undefined;
  };
  error?: undefined;
}

export interface DiscoveryWorkflowResultsError {
  success: false;
  result?: undefined;
  error: string;
}

export type DiscoveryWorkflowResultsResult =
  | DiscoveryWorkflowResultsSuccess
  | DiscoveryWorkflowResultsError;

// Device scan list result types
export interface DeviceScanListSuccess {
  success: true;
  activeScans: string[];
  count: number;
  error?: undefined;
}

export interface DeviceScanListError {
  success: false;
  activeScans: never[];
  count: 0;
  error: string;
}

export type DeviceScanListResult =
  | DeviceScanListSuccess
  | DeviceScanListError;

// Port scan start result types
export interface PortScanStartSuccess {
  success: true;
  scanId: string;
  scanRunId: number | string;
  target: string;
  ports: string[];
  totalPorts: number;
  message: string;
  error?: undefined;
}

export interface PortScanStartError {
  success: false;
  scanId?: undefined;
  scanRunId?: undefined;
  target: string;
  error: string;
}

export type PortScanStartResult =
  | PortScanStartSuccess
  | PortScanStartError;

// Cancel port scan result types
export interface CancelPortScanSuccess {
  success: true;
  scanId: string;
  scanRunId?: string;
  status: 'canceled';
  error?: undefined;
}

export interface CancelPortScanError {
  success: false;
  scanId?: undefined;
  scanRunId?: undefined;
  status?: undefined;
  error: string;
}

export type CancelPortScanResult =
  | CancelPortScanSuccess
  | CancelPortScanError;

// Get port scan state result types
export interface PortScanStateSuccess {
  success: true;
  state: {
    scanId: string;
    status: string;
    message: string;
  };
  error?: undefined;
  errorType?: undefined;
  shouldStopPolling?: undefined;
}

export interface PortScanStateError {
  success: false;
  state?: undefined;
  error: string;
  errorType: 'QUERY_ERROR';
  shouldStopPolling: false;
}

export type PortScanStateResult =
  | PortScanStateSuccess
  | PortScanStateError;
