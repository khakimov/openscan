/**
 * Server-side scan configuration presets
 *
 * Security: All scan parameters are defined server-side to prevent
 * clients from manipulating timeouts, port ranges, or scan profiles.
 *
 * Clients can only select which preset to use.
 */

import type { PortScanInput } from '@repo/contracts';

export const SCAN_PRESETS = {
  /**
   * Quick scan - Common ports only (1-1024)
   * Use for initial device discovery
   */
  QUICK: {
    timeout: 30000, // 30 seconds
    scanProfile: 'PS_L1' as const,
    aggressive: false,
    additionalPortRanges: ['1-1024'],
    mode: undefined,
  },

  /**
   * Standard scan - Extended common ports (1-10000)
   * Use for regular monitoring
   */
  STANDARD: {
    timeout: 60000, // 1 minute
    scanProfile: 'PS_L3' as const,
    aggressive: false,
    additionalPortRanges: ['1-10000'],
    mode: 'EXTEND' as const,
  },

  /**
   * Thorough scan - Full port range (1-65535)
   * Use for comprehensive security assessment
   */
  THOROUGH: {
    timeout: 300000, // 5 minutes
    scanProfile: 'PS_L5' as const,
    aggressive: true,
    additionalPortRanges: ['1-65535'],
    mode: 'EXTEND' as const,
  },
} as const;

export type ScanPresetType = keyof typeof SCAN_PRESETS;

/**
 * Build PortScanInput from preset and target information
 * All security-sensitive parameters come from the preset
 */
export function buildScanInputFromPreset(
  preset: ScanPresetType,
  target: string,
  deviceId: string,
  protocol: 'tcp' | 'udp' = 'tcp'
): PortScanInput {
  const config = SCAN_PRESETS[preset];

  return {
    target,
    deviceId,
    protocol,
    timeout: config.timeout,
    isExtendScan: preset !== 'QUICK',
    mode: config.mode,
    scanProfile: config.scanProfile,
    aggressive: config.aggressive,
    // Cast to mutable array since PortScanInput expects non-readonly
    additionalPortRanges: [...config.additionalPortRanges],
  };
}

/**
 * Get user-friendly description of scan preset
 */
export function getScanPresetDescription(preset: ScanPresetType): string {
  const descriptions = {
    QUICK: 'Quick scan of common ports (1-1024)',
    STANDARD: 'Standard scan of extended ports (1-10000)',
    THOROUGH: 'Thorough scan of all ports (1-65535)',
  };
  return descriptions[preset];
}

/**
 * Get estimated duration for scan preset
 */
export function getScanPresetDuration(preset: ScanPresetType): string {
  const durations = {
    QUICK: '~30 seconds',
    STANDARD: '~1 minute',
    THOROUGH: '~5 minutes',
  };
  return durations[preset];
}
