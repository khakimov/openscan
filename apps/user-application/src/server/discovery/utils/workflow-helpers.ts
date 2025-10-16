import type { DiscoveryRequest } from '@repo/temporal/types';

export function normalizeTargetForWorkflowId(target: string) {
  return target.replace(/[^a-zA-Z0-9]/g, '-');
}

export function generateWorkflowId(prefix: string, target: string) {
  return `${prefix}-${normalizeTargetForWorkflowId(target)}-${Date.now()}`;
}

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
        tool: 'temporal-scanner',
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
