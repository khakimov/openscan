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

export function buildDiscoveryResult(discoveryOutput: any) {
  const results = discoveryOutput?.devices?.map((device: any) => ({
    host: device.hostname,
    ip: device.ipAddress || '',
  })) || [];

  const target = discoveryOutput?.devices?.[0]?.metadata?.originalDomain || 'unknown';
  const errors = discoveryOutput?.errors || [];

  return {
    request: {
      target,
      scanType: 'basic',
      tools: ['subfinder'],
    },
    results: [
      {
        target,
        subdomains: results.map((entry: { host: string; ip: string }) => entry.host),
        results,
        tool: 'restate-scanner',
        timestamp: new Date().toISOString(),
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    ],
    totalSubdomains: results.length,
    uniqueSubdomains: results.map((entry: { host: string; ip: string }) => ({
      subdomain: entry.host,
      ip: entry.ip,
    })),
    executionTime: discoveryOutput?.performance?.executionTimeMs ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  } as const;
}

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
