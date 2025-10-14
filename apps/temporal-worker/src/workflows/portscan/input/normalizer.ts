import type { PortScanInput, ScanProfile, PortScanMode, ScanScope, AuthScanType } from '@repo/temporal/contracts';
import { sanitizePortList, sanitizeStringList } from '../../../utilities/port-utils';

/**
 * Normalized port scan input with sanitized and validated fields
 */
export interface NormalizedPortScanInput {
  scanId: string;
  target: string;
  deviceId?: string;
  mode?: PortScanMode;
  scanProfile: ScanProfile;
  scope: ScanScope;
  authScanType: AuthScanType;
  timeout: number;
  aggressive: boolean;
  isExtendScan: boolean;

  // Sanitized port hints
  requestedPorts?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];

  // Metadata
  createdAt: Date;
}

/**
 * Normalizes and validates port scan input from workflow
 * Ensures all fields have sensible defaults and sanitized values
 */
export function normalizePortScanInput(input: PortScanInput): NormalizedPortScanInput {
  return {
    scanId: input.scanId,
    target: input.target.trim(),
    deviceId: input.deviceId,
    mode: input.mode,
    scanProfile: input.profile || 'PS_L1',
    scope: input.scope || 'UNKNOWN',
    authScanType: input.authScanType || 'ANONYMOUS',
    timeout: input.timeout || 30000,
    aggressive: input.aggressive || false,
    isExtendScan: input.isExtendScan || false,

    // Sanitize port hints
    requestedPorts: sanitizePortList(input.requestedPorts),
    seedPorts: sanitizePortList(input.seedPorts),
    historicPorts: sanitizePortList(input.historicPorts),
    additionalPortRanges: sanitizeStringList(input.additionalPortRanges),

    createdAt: input.createdAt || new Date(),
  };
}
