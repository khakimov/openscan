/**
 * Restate Client Utility
 *
 * Provides a simple, reusable interface for calling Restate services.
 * Follows patterns from docs/best-practices/restate.md
 *
 * @example
 * ```typescript
 * // Start async workflow
 * const result = await sendToRestate({
 *   service: 'Discovery',
 *   method: 'discover',
 *   data: { targets: [...] },
 *   async: true, // Uses /send endpoint
 * });
 *
 * // Query keyed entity state
 * const state = await sendToRestate({
 *   service: 'Discovery',
 *   key: scanId,
 *   method: 'getState',
 * });
 * ```
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-client' });

/**
 * Common Restate error types for better error handling
 */
export type RestateErrorType =
  | 'CONNECTION_REFUSED'
  | 'FETCH_FAILED'
  | 'SERVICE_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export class RestateError extends Error {
  constructor(
    message: string,
    public type: RestateErrorType,
    public statusCode?: number,
    public cause?: Error
  ) {
    super(message);
    this.name = 'RestateError';
  }
}

/**
 * Options for calling Restate services
 */
export interface RestateCallOptions<TData = any> {
  /** Service name (e.g., 'Discovery', 'PortScanner') */
  service: string;

  /** Handler/method name (e.g., 'discover', 'scan', 'getState') */
  method: string;

  /** Optional key for keyed entities (workflows, virtual objects) */
  key?: string;

  /** Request payload */
  data?: TData;

  /**
   * Use async invocation (/send endpoint)
   * Returns immediately with invocation ID instead of waiting for result
   */
  async?: boolean;

  /** Optional timeout in milliseconds */
  timeout?: number;
}

/**
 * Get Restate ingress URL from environment
 */
function getRestateUrl(): string {
  const url = process.env.RESTATE_INGRESS_URL || 'http://localhost:8080';

  // Remove trailing slash if present
  return url.replace(/\/$/, '');
}

/**
 * Build Restate endpoint URL following the pattern:
 * - Service handler: /ServiceName/methodName
 * - Keyed entity: /ServiceName/{key}/methodName
 * - Async (send): /ServiceName/methodName/send or /ServiceName/{key}/methodName/send
 */
function buildRestateUrl(options: RestateCallOptions): string {
  const baseUrl = getRestateUrl();
  const { service, method, key, async } = options;

  let url = `${baseUrl}/${service}`;

  if (key) {
    url += `/${encodeURIComponent(key)}`;
  }

  url += `/${method}`;

  if (async) {
    url += '/send';
  }

  return url;
}

/**
 * Parse error response and determine error type
 */
function parseRestateError(error: unknown, url: string): RestateError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Connection refused (Restate not running)
    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return new RestateError(
        'Restate server is not running. Please ensure Restate is started.',
        'CONNECTION_REFUSED',
        undefined,
        error
      );
    }

    // Fetch failed (network/DNS issues)
    if (message.includes('fetch failed') || message.includes('network')) {
      return new RestateError(
        `Unable to connect to Restate at ${url}. Check RESTATE_INGRESS_URL configuration.`,
        'FETCH_FAILED',
        undefined,
        error
      );
    }

    // Other errors
    return new RestateError(error.message, 'UNKNOWN', undefined, error);
  }

  return new RestateError(String(error), 'UNKNOWN');
}

/**
 * Send request to Restate service
 *
 * @template TResponse - Expected response type
 * @param options - Call options
 * @returns Response from Restate service
 * @throws {RestateError} If request fails
 *
 * @example
 * ```typescript
 * // Synchronous call (wait for result)
 * const result = await sendToRestate<{ scanId: string; ports: any[] }>({
 *   service: 'PortScanner',
 *   method: 'scan',
 *   data: { target: '192.168.1.1' },
 * });
 *
 * // Asynchronous call (fire and forget)
 * const { invocationId } = await sendToRestate({
 *   service: 'Discovery',
 *   method: 'discover',
 *   data: { targets: ['example.com'] },
 *   async: true,
 * });
 *
 * // Query keyed entity
 * const state = await sendToRestate<DiscoveryState>({
 *   service: 'Discovery',
 *   key: 'scan-example-com-123',
 *   method: 'getState',
 * });
 * ```
 */
export async function sendToRestate<TResponse = any>(
  options: RestateCallOptions
): Promise<TResponse> {
  const url = buildRestateUrl(options);
  const { data = {}, timeout } = options;

  logger.info('Calling Restate service', {
    service: options.service,
    method: options.method,
    key: options.key,
    async: options.async,
    url,
  });

  try {
    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : undefined;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Handle non-2xx responses
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Restate service error', {
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });

      throw new RestateError(
        `Restate service error (${response.status}): ${errorText || response.statusText}`,
        'SERVICE_ERROR',
        response.status
      );
    }

    // Parse response
    let result: TResponse;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      result = await response.json();
    } else {
      // For /send endpoints, response might be empty or plain text
      const text = await response.text();
      result = (text ? { message: text } : {}) as TResponse;
    }

    logger.info('Restate service call successful', {
      service: options.service,
      method: options.method,
      key: options.key,
    });

    return result;
  } catch (error) {
    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Restate service timeout', { url, timeout });
      throw new RestateError(
        `Request to Restate timed out after ${timeout}ms`,
        'NETWORK_ERROR'
      );
    }

    // Parse and throw RestateError
    const restateError = parseRestateError(error, url);
    logger.error('Restate service call failed', {
      url,
      error: restateError.message,
      type: restateError.type,
    });
    throw restateError;
  }
}

/**
 * Common response types for type safety
 */

export interface AsyncInvocationResponse {
  invocationId?: string;
  message?: string;
}

export interface DiscoveryStartResponse {
  scanId: string;
  invocationId?: string;
}

export interface DiscoveryState {
  phase: 'VALIDATING' | 'DISCOVERING' | 'COMPLETED' | 'FAILED';
  totalTargets: number;
  processedTargets: number;
  devicesFound: number;
  devices?: Array<{
    scope: 'EXTERNAL' | 'INTERNAL';
    hostname: string;
    ipAddress?: string;
    discoveredAt: string;
    discoveryMethod: string;
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

export interface PortScanState {
  scanId: string;
  target: string;
  status: 'VALIDATING' | 'PRESCANNING' | 'SCANNING' | 'PARSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  portsFound?: number;
  prescanPortsFound?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  message?: string;
}
