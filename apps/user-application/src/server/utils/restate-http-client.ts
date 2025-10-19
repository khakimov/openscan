/**
 * Restate HTTP Client
 *
 * Simple HTTP client for calling Restate services.
 * Works in all environments (Node.js, Cloudflare Workers, etc.)
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-http-client' });

export interface RestateDiscoveryInput {
  targets: Array<{
    type: 'DOMAIN' | 'IP' | 'CIDR';
    value: string;
    scope: 'EXTERNAL' | 'INTERNAL';
  }>;
  tools?: Array<'subfinder' | 'amass' | 'assetfinder'>;
  enablePingSweep?: boolean;
  scanId?: string;
  callbackUrl?: string;
  organizationId?: string;
}

export interface RestateDiscoveryOutput {
  scanId: string;
  startedAt: string;
  completedAt: string;
  devices: Array<{
    scope: 'EXTERNAL' | 'INTERNAL';
    hostname: string;
    ipAddress?: string;
    discoveredAt: string;
    discoveryMethod: 'subfinder' | 'amass' | 'assetfinder' | 'direct';
    confidence: number;
    metadata: {
      originalDomain: string;
      source?: string;
    };
  }>;
  totalTargetsProcessed: number;
  errors: string[];
  performance: {
    executionTimeMs: number;
    devicesPerSecond: number;
  };
}

export interface RestateDiscoveryState {
  phase: 'VALIDATING' | 'DISCOVERING' | 'COMPLETED' | 'FAILED';
  totalTargets: number;
  processedTargets: number;
  devicesFound: number;
  devices?: Array<{
    scope: 'EXTERNAL' | 'INTERNAL';
    hostname: string;
    ipAddress?: string;
    discoveredAt: string;
    discoveryMethod: 'subfinder' | 'amass' | 'assetfinder' | 'direct';
    confidence: number;
    metadata: {
      originalDomain: string;
      source?: string;
    };
  }>;
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

export class RestateHttpClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl?: string) {
    // Default to Restate Cloud URL or localhost
    this.baseUrl = baseUrl || process.env.RESTATE_INGRESS_URL || 'http://localhost:8080';
    this.apiKey = process.env.RESTATE_API_KEY;
  }

  /**
   * Get headers with optional API key for Restate Cloud
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      // Try multiple header formats that Restate Cloud might use
      // Standard OAuth Bearer token
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      // Alternative: x-restate-server-key (some Restate setups use this)
      headers['x-restate-server-key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Start discovery workflow
   *
   * Discovery is a WORKFLOW (not a service), so it requires:
   * 1. A workflow key in the URL path
   * 2. Calling the 'run' handler
   * 3. Using /send for async execution
   */
  async startDiscovery(input: RestateDiscoveryInput): Promise<RestateDiscoveryOutput> {
    // Generate scanId or use provided one
    const scanId = input.scanId || `discovery-${Date.now()}`;

    // Workflow invocation pattern: /WorkflowName/{key}/handlerName/send
    const url = `${this.baseUrl}/Discovery/${scanId}/run/send`;

    logger.info('Starting async discovery workflow in Restate', {
      url,
      scanId,
      targets: input.targets.length,
    });

    try {
      const headers = {
        ...this.getHeaders(),
        // CRITICAL: For workflows, use idempotency-key to ensure workflow key matches
        'idempotency-key': scanId,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...input, scanId }), // Include scanId in payload
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      // /send endpoint returns immediately - workflow runs in background
      const invocationId = response.headers.get('x-restate-invocation-id');

      logger.info('Discovery workflow started successfully', {
        scanId,
        invocationId,
        targets: input.targets.length,
      });

      // Return minimal response - results will come via state polling
      // Client should poll getDiscoveryState() to get results
      return {
        scanId,
        startedAt: new Date().toISOString(),
        completedAt: '', // Not completed yet - will be populated via polling
        devices: [], // Empty - will be populated via polling
        totalTargetsProcessed: 0,
        errors: [],
        performance: {
          executionTimeMs: 0,
          devicesPerSecond: 0,
        },
      } as RestateDiscoveryOutput;
    } catch (error) {
      logger.error('Failed to call Restate Discovery service', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      throw error;
    }
  }

  /**
   * Get discovery state (for polling)
   *
   * For workflows, we need to call the shared handler with the workflow key in the URL
   */
  async getDiscoveryState(scanId: string): Promise<RestateDiscoveryState | { error: string }> {
    // Workflow shared handler pattern: /WorkflowName/{key}/getState
    const url = `${this.baseUrl}/Discovery/${scanId}/getState`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}), // Empty body - key is in URL
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (error) {
      logger.error('Failed to get discovery state', {
        error: error instanceof Error ? error.message : String(error),
        scanId,
      });
      throw error;
    }
  }

  /**
   * Start port scan workflow (async with postback)
   * Uses /send endpoint to start workflow without blocking
   */
  async startPortScan(input: {
    target: string;
    ports?: string;
    protocol?: 'tcp' | 'udp';
    aggressive?: boolean;
    timeout?: number;
    callbackUrl?: string;
    deviceId?: string;
    scanId?: string; // Restate workflow key (optional - will be generated if not provided)
    organizationId?: string; // Required for postback handler
  }): Promise<{
    scanId: string;
    target: string;
    invocationId?: string;
  }> {
    // Use /send endpoint for async workflow execution
    const url = `${this.baseUrl}/PortScanner/scan/send`;

    // Use scanId from input or generate one if not provided
    const scanId = input.scanId || `portscan-${input.target}-${Date.now()}`;

    logger.info('Starting async port scan in Restate', {
      url,
      target: input.target,
      scanId,
      hasCallback: !!input.callbackUrl,
    });

    try {
      const headers = {
        ...this.getHeaders(),
        // CRITICAL: Restate uses idempotency-key to track workflow invocations
        // Without this, we can't query the scan state later
        'idempotency-key': scanId,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      // /send endpoint returns immediately with invocation metadata
      // Extract invocation ID from response headers or body
      const invocationId = response.headers.get('x-restate-invocation-id');

      logger.info('Port scan workflow started successfully', {
        target: input.target,
        scanId,
        invocationId,
      });

      // Return scanId and target - results will come via postback callback
      return {
        scanId,
        target: input.target,
        invocationId: invocationId || undefined,
      };
    } catch (error) {
      logger.error('Failed to start port scan workflow', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      throw error;
    }
  }

  /**
   * Cancel a running port scan
   */
  async cancelPortScan(scanId: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const url = `${this.baseUrl}/PortScanner/cancel`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ scanId, reason }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (error) {
      logger.error('Failed to cancel port scan', {
        error: error instanceof Error ? error.message : String(error),
        scanId,
      });
      throw error;
    }
  }

  /**
   * Get port scan state/progress
   */
  async getPortScanState(scanId: string): Promise<{ scanId: string; status: string; message?: string }> {
    const url = `${this.baseUrl}/PortScanner/getState`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ scanId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (error) {
      logger.error('Failed to get port scan state', {
        error: error instanceof Error ? error.message : String(error),
        scanId,
      });
      throw error;
    }
  }
}

/**
 * Get Restate HTTP client instance
 */
export function getRestateHttpClient(baseUrl?: string): RestateHttpClient {
  return new RestateHttpClient(baseUrl);
}
