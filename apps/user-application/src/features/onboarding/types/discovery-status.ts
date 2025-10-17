/**
 * Discovery workflow status types
 * Discriminated union for type-safe status handling
 *
 * Updated for Restate workflow pattern (sec-42):
 * - Single scanId instead of workflowId + runId
 */

export type DiscoveryStatus = {
  scanId?: string;
  status?: "RUNNING" | "COMPLETED" | "FAILED" | "UNKNOWN";
  message?: string;
  error?: string;
  isRuntimeError?: boolean;
  result?: DiscoveryResult;
};

export type DiscoveryResult = {
  totalSubdomains: number;
  uniqueSubdomains: Array<DiscoverySubdomain>;
  errors?: string[];
};

export type DiscoverySubdomain = {
  subdomain: string;
  ip: string;
};
