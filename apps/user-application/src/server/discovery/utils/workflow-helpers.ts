/**
 * Workflow Helper Functions
 *
 * Shared utilities for discovery workflows
 */

import { normalizeDiscoveryResult as normalizeResult } from '@/features/discovery/utils/normalize-workflow-results';

// Re-export normalize function
export { normalizeResult as normalizeDiscoveryResult };

/**
 * Generate a unique workflow ID for discovery
 */
export function generateWorkflowId(prefix: string, target: string): string {
  const sanitizedTarget = target.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${prefix}-${sanitizedTarget}-${Date.now()}`;
}

/**
 * Generate a unique scan ID
 */
export function generateScanId(prefix: string, target: string): string {
  const sanitizedTarget = target.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${prefix}-${sanitizedTarget}-${Date.now()}`;
}

/**
 * Extract error message from unknown error
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Discovery request type
 */
export interface DiscoveryRequest {
  target: string;
  organizationId: string;
  projectId?: string;
  tools?: string[];
  enablePingSweep?: boolean;
}
