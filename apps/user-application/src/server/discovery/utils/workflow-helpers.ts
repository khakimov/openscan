/**
 * Discovery request type (migrated from Temporal contracts)
 */
export interface DiscoveryRequest {
  target: string;
  scanType: string;
  tools: Array<'subfinder' | 'amass' | 'assetfinder'>;
}

export function normalizeTargetForScanId(target: string) {
  return target.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Generate scanId (Restate workflow key)
 * Format: "{prefix}-{normalized-target}-{timestamp}"
 * Example: "portscan-192-168-1-1-1760694114399"
 */
export function generateScanId(prefix: string, target: string) {
  return `${prefix}-${normalizeTargetForScanId(target)}-${Date.now()}`;
}

// Legacy alias for backward compatibility during migration
export const generateWorkflowId = generateScanId;
export const normalizeTargetForWorkflowId = normalizeTargetForScanId;

export function buildDiscoveryRequest(target: string): DiscoveryRequest {
  return {
    target,
    scanType: 'basic',
    tools: ['subfinder'],
  };
}

/**
 * Re-export the centralized normalizer for any legacy callers
 * The actual implementation is in @/features/discovery/utils
 */
export { normalizeDiscoveryResult } from '@/features/discovery/utils';

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
