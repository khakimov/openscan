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
      headers['Authorization'] = `Bearer ${this.apiKey}`;
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
   * Start port scan workflow
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
    ports: any[];
    totalPorts: number;
    scanDuration: number;
    completedAt: string;
  }> {
    const url = `${this.baseUrl}/PortScanner/scan`;

    logger.info('Calling Restate PortScanner service', {
      url,
      target: input.target,
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

      const result = (await response.json()) as {
        scanId: string;
        target: string;
        ports: any[];
        totalPorts: number;
        scanDuration: number;
        completedAt: string;
      };

      logger.info('Port scan completed', {
        scanId: result.scanId,
        portsFound: result.totalPorts,
      });

      return result;
    } catch (error) {
      logger.error('Failed to call Restate PortScanner service', {
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
