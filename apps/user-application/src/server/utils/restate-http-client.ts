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
   */
  async startDiscovery(input: RestateDiscoveryInput): Promise<RestateDiscoveryOutput> {
    const url = `${this.baseUrl}/Discovery/discover`;

    logger.info('Calling Restate Discovery service', {
      url,
      targets: input.targets.length,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      const result = (await response.json()) as RestateDiscoveryOutput;

      logger.info('Discovery completed', {
        scanId: result.scanId,
        devicesFound: result.devices?.length || 0,
        errors: result.errors?.length || 0,
      });

      return result;
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
   */
  async getDiscoveryState(scanId: string): Promise<RestateDiscoveryState | { error: string }> {
    const url = `${this.baseUrl}/Discovery/getState`;

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
    workflowId?: string;
  }): Promise<{
    scanId: string;
    target: string;
  }> {
    // Use /send endpoint for async workflow execution
    const url = `${this.baseUrl}/PortScanner/scan/send`;

    logger.info('Starting async port scan in Restate', {
      url,
      target: input.target,
      hasCallback: !!input.callbackUrl,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Restate service error (${response.status}): ${errorText}`);
      }

      // /send endpoint returns immediately without waiting for scan results
      // Results will come via postback callback
      logger.info('Port scan workflow started successfully', {
        target: input.target,
      });

      // Return scanId and target - results will come via postback
      return {
        scanId: input.workflowId || input.target,
        target: input.target,
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
