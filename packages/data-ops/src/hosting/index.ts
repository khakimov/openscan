/**
 * Hosting Provider Detection Module
 * 
 * Exports hosting provider detection utilities and types.
 */

export {
  detectHostingProvider,
  upsertHostingProvider,
  updateDeviceIpHosting,
  getIpsNeedingDetection,
  getHostingProviderForDevice,
  batchDetectHosting,
  type HostingDetectionResult,
} from './detector';
