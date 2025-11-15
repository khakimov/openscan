/**
 * Device server utilities
 *
 * All device queries and mutations have been migrated to tRPC.
 * This file exports only shared types and transforms needed by components.
 *
 * Use tRPC for data operations:
 * - Queries: trpc.device.detail, trpc.device.scanHistory, etc.
 * - Mutations: trpc.device.update, trpc.device.remove, etc.
 */

// Transform utilities
export { transformDeviceForUI } from './transforms';

// Type exports from contracts (single source of truth)
export type {
  TransformedDevice,
  DeviceOperationResult,
  DevicesListResult,
  DeviceDetailResult,
  DeviceVulnerability,
  DeviceVulnerabilitiesResult,
  DeleteDeviceResult,
  DiscoveryDevicesResult,
  CreateDevicesResult,
  UpdateDeviceResult,
  VerifyDeviceResult,
  DeviceScanHistoryResult,
  ToggleDeviceVerificationResult,
  StartDeviceScanResult,
} from '@repo/contracts/device';

// Scan preset utilities
export * from './scan-presets';
