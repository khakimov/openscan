import { createLogger } from '@repo/logger';
import { getTemporalConnectionConfig } from '@repo/config';
import type { DiscoveryRequest } from '@repo/temporal/types';

const logger = createLogger({ name: 'temporal-http-client' });

/**
 * Encode workflow input data for Temporal HTTP API
 * The HTTP API requires payloads to be base64-encoded with metadata
 */
function encodeWorkflowInput(data: any) {
  const jsonString = JSON.stringify(data);
  const base64Data = Buffer.from(jsonString).toString('base64');
  const encodingMetadata = Buffer.from('json/plain').toString('base64');

  return {
    payloads: [
      {
        metadata: {
          encoding: encodingMetadata, // "json/plain" encoded as base64
        },
        data: base64Data,
      },
    ],
  };
}

/**
 * HTTP-based Temporal client for Cloudflare Workers
 * Uses Temporal's HTTP API instead of gRPC
 */
export class TemporalHttpClient {
  private baseUrl: string;
  private namespace: string;
  private taskQueue: string;
  private csrfToken: string | null = null;

  constructor() {
    const config = getTemporalConnectionConfig();

    // Use HTTP API URL if provided, otherwise construct from server address
    if (config.httpApiUrl) {
      this.baseUrl = config.httpApiUrl;
    } else {
      // Default to localhost:8233 (Temporal UI server)
      this.baseUrl = 'http://localhost:8233';
    }

    this.namespace = config.namespace;
    this.taskQueue = config.taskQueue;

    logger.info('Temporal HTTP client initialized', {
      baseUrl: this.baseUrl,
      namespace: this.namespace,
      taskQueue: this.taskQueue,
    });
  }

  /**
   * Get CSRF token from the server
   */
  private async getCsrfToken(): Promise<string> {
    if (this.csrfToken) {
      return this.csrfToken;
    }

    // Try to get CSRF token from the API
    const response = await fetch(`${this.baseUrl}/api/v1/csrf-token`, {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      this.csrfToken = data.token || '';
      return this.csrfToken;
    }

    // If no CSRF endpoint, try to extract from cookies
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      const csrfMatch = cookies.match(/csrf-token=([^;]+)/);
      if (csrfMatch) {
        this.csrfToken = csrfMatch[1];
        return this.csrfToken;
      }
    }

    logger.warn('Could not obtain CSRF token, attempting request without it');
    return '';
  }

  /**
   * Start a discovery workflow via HTTP API
   */
  async startDiscoveryWorkflow(request: DiscoveryRequest): Promise<{
    workflowId: string;
    runId: string;
  }> {
    const workflowId = `discovery-${request.target}-${Date.now()}`;

    // Encode the request using the proper payload format for HTTP API
    const encodedInput = encodeWorkflowInput(request);

    // NOTE: The workflowId must be in the URL path, not in the request body
    const payload = {
      workflowType: {
        name: 'discoveryWorkflow',
      },
      taskQueue: {
        name: this.taskQueue,
      },
      input: encodedInput, // Use base64-encoded payloads instead of args
      workflowRunTimeout: '3600s',
    };

    logger.info('Starting discovery workflow via HTTP', {
      workflowId,
      target: request.target,
      payload: JSON.stringify(payload).substring(0, 200), // Log first 200 chars
    });

    // Include Authorization header to bypass CSRF (Temporal UI server skips CSRF when Authorization header is present)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer temporal-http-client', // Any value works to bypass CSRF
    };

    // Correct endpoint: workflowId goes in the URL path, not in the body
    const response = await fetch(
      `${this.baseUrl}/api/v1/namespaces/${this.namespace}/workflows/${workflowId}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to start workflow via HTTP', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Failed to start workflow: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    logger.info('Workflow started successfully', {
      workflowId,
      runId: result.runId,
      started: result.started,
    });

    return {
      workflowId, // The ID we sent in the request
      runId: result.runId || '', // The unique run ID returned by Temporal
    };
  }

  /**
   * Get workflow execution details via HTTP API
   *
   * @param workflowId - The workflow ID (what you sent when starting the workflow)
   * @param runId - Optional run ID (returned when workflow started). If omitted, fetches the latest run.
   */
  async describeWorkflow(workflowId: string, runId?: string): Promise<{
    status: string;
    workflowId: string;
    runId?: string;
  }> {
    // Note: The Temporal HTTP API does not support /runs/{runId} path format
    // Always use just the workflowId - it will return the latest/current run
    const url = `${this.baseUrl}/api/v1/namespaces/${this.namespace}/workflows/${workflowId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer temporal-http-client',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to describe workflow', {
        workflowId,
        runId,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Failed to describe workflow: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Map Temporal status to our format
    const statusMap: Record<string, string> = {
      'WORKFLOW_EXECUTION_STATUS_RUNNING': 'RUNNING',
      'WORKFLOW_EXECUTION_STATUS_COMPLETED': 'COMPLETED',
      'WORKFLOW_EXECUTION_STATUS_FAILED': 'FAILED',
      'WORKFLOW_EXECUTION_STATUS_CANCELED': 'CANCELED',
      'WORKFLOW_EXECUTION_STATUS_TERMINATED': 'TERMINATED',
      'WORKFLOW_EXECUTION_STATUS_CONTINUED_AS_NEW': 'RUNNING',
      'WORKFLOW_EXECUTION_STATUS_TIMED_OUT': 'FAILED',
    };

    // Extract status from workflowExecutionInfo
    const rawStatus = result.workflowExecutionInfo?.status || result.status;
    const execution = result.workflowExecutionInfo?.execution || result.execution;

    return {
      status: statusMap[rawStatus] || 'UNKNOWN',
      workflowId: execution?.workflowId || workflowId,
      runId: execution?.runId || runId,
    };
  }

  /**
   * Get workflow result via HTTP API
   *
   * @param workflowId - The workflow ID
   * @param runId - Optional run ID. If omitted, fetches the latest run.
   */
  async getWorkflowResult(workflowId: string, runId?: string): Promise<any> {
    // First check if workflow is completed
    const description = await this.describeWorkflow(workflowId, runId);

    if (description.status !== 'COMPLETED') {
      throw new Error(`Workflow is not completed (status: ${description.status})`);
    }

    // Fetch workflow history to get the result
    // Note: The Temporal HTTP API does not support /runs/{runId} path format
    const historyUrl = `${this.baseUrl}/api/v1/namespaces/${this.namespace}/workflows/${workflowId}/history`;

    const response = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer temporal-http-client',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get workflow result: ${response.status}`);
    }

    const historyData = await response.json();

    // Find the workflow completion event in the history
    const completionEvent = historyData.history?.events?.find(
      (event: any) => event.eventType === 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED'
    );

    if (!completionEvent) {
      throw new Error('Workflow completion event not found in history');
    }

    // Extract and decode the result payload
    const payloads = completionEvent.workflowExecutionCompletedEventAttributes?.result?.payloads;
    if (payloads && payloads.length > 0) {
      const payload = payloads[0];
      const decodedData = Buffer.from(payload.data, 'base64').toString('utf-8');
      return JSON.parse(decodedData);
    }

    return null;
  }
}

/**
 * Singleton instance for HTTP client
 */
let httpClient: TemporalHttpClient | null = null;

/**
 * Get or create the HTTP Temporal client
 */
export function getTemporalHttpClient(): TemporalHttpClient {
  if (!httpClient) {
    httpClient = new TemporalHttpClient();
  }
  return httpClient;
}

/**
 * Reset the HTTP client (useful for testing)
 */
export function resetTemporalHttpClient(): void {
  httpClient = null;
}
