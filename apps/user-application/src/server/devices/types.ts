/**
 * Shared device types for server functions
 * These types eliminate the need for defensive casts in route loaders
 */

import type { TransformedDevice } from './transforms';

/**
 * Standard success/error response pattern for device operations
 */
export type DeviceOperationResult<T = void> =
  | {
      success: true;
      data?: T;
      error?: undefined;
    }
  | {
      success: false;
      data?: undefined;
      error: string;
    };

/**
 * getDevicesData return type
 */
export interface DevicesListResult {
  items: TransformedDevice[];
  totalCount: number;
  page: number;
  totalPages: number;
}

/**
 * getDeviceDetailData return type (single device)
 */
export type DeviceDetailResult = TransformedDevice;

/**
 * Device vulnerability type
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
export type DeleteDeviceResult =
  | {
      success: true;
      message: string;
      error?: undefined;
    }
  | {
      success: false;
      message?: undefined;
      error: string;
    };

/**
 * getDiscoveryDevices return type
 */
export type DiscoveryDevicesResult =
  | {
      success: true;
      devices: Array<{
        id: string;
        name: string;
        ip: string | null;
      }>;
      count: number;
      error?: undefined;
    }
  | {
      success: false;
      devices: Array<never>;
      count: 0;
      error?: string;
    };

/**
 * createDevicesFromDiscovery return type
 */
export type CreateDevicesResult =
  | {
      success: true;
      devices: TransformedDevice[];
      count: number;
      error?: undefined;
    }
  | {
      success: false;
      devices?: undefined;
      count?: undefined;
      error: string;
    };

/**
 * updateDeviceData return type
 */
export type UpdateDeviceResult =
  | {
      success: true;
      device: TransformedDevice;
      error?: undefined;
    }
  | {
      success: false;
      device?: undefined;
      error: string;
    };

/**
 * verifyDevice return type
 */
export type VerifyDeviceResult =
  | {
      success: true;
      device: TransformedDevice;
      error?: undefined;
    }
  | {
      success: false;
      device?: undefined;
      error: string;
    };

/**
 * getDeviceScanHistoryData return type
 */
export type DeviceScanHistoryResult =
  | {
      success: true;
      history: Array<{
        id: string;
        requestedAt: any;
        resultSummary?: any;
      }>;
      error?: undefined;
    }
  | {
      success: false;
      history: Array<never>;
      error?: string;
    };

/**
 * toggleDeviceVerification return type
 */
export type ToggleDeviceVerificationResult =
  | {
      success: true;
      verified: boolean;
      message: string;
      error?: undefined;
    }
  | {
      success: false;
      verified?: undefined;
      message?: undefined;
      error: string;
    };

/**
 * startDeviceScan return type
 */
export type StartDeviceScanResult =
  | {
      success: true;
      scanId?: string;
      preset: string;
      presetDescription: string;
      error?: undefined;
    }
  | {
      success: false;
      scanId?: undefined;
      preset?: undefined;
      presetDescription?: undefined;
      error: string;
    };
