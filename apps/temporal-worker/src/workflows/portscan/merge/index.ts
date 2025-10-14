/**
 * Port merging and result combination utilities
 *
 * This module handles combining results from multiple scan sources
 * while preserving discovery attribution and timing information.
 */

export {
  combinePreScanPorts,
  deriveAdditionalPortsForNmap,
  mergePreScanDiscoveries,
  annotateNmapPorts,
  earliestTimestamp,
  latestTimestamp,
  type NmapScanResult,
} from './port-merger';
