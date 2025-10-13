/**
 * Discovery workflow status types
 * Discriminated union for type-safe status handling
 */

export type DiscoveryStatus = {
  workflowId?: string;
  runId?: string;
  status?: "RUNNING" | "COMPLETED" | "FAILED" | "UNKNOWN";
  message?: string;
  error?: string;
  isRuntimeError?: boolean;
  result?: DiscoveryResult;
};

export type DiscoveryResult = {
  totalSubdomains: number;
  uniqueSubdomains: Array<DiscoverySubdomain>;
};

export type DiscoverySubdomain = {
  subdomain: string;
  ip: string;
};
