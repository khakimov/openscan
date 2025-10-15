/**
 * Postback helper for posting scan results to server
 *
 * Used by Restate services to POST results back to TanStack Start API
 * when scans complete.
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-postback' });

/**
 * Payload for postback
 * Generic to support different result types (portscan, discovery, etc.)
 */
export interface PostbackPayload {
  callbackUrl: string;
  deviceId: string;
  workflowId: string;
  results: any; // Generic - can be PortScanResult, DiscoveryResult, etc.
}

/**
 * Posts scan results to server callback URL
 * Uses WORKER_API_KEY for authentication
 * Throws on failure (caller should handle retries)
 */
export async function postbackScanResults(payload: PostbackPayload): Promise<void> {
  const { callbackUrl, ...data } = payload;

  logger.info('Posting scan results to server', {
    callbackUrl,
    deviceId: data.deviceId,
    workflowId: data.workflowId,
    resultsType: data.results?.constructor?.name || typeof data.results,
  });

  const apiKey = process.env.WORKER_API_KEY;
  if (!apiKey) {
    const error = 'WORKER_API_KEY not configured';
    logger.error('Postback configuration error', { error });
    throw new Error(error);
  }

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(data), // Excludes callbackUrl from body
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Postback failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        callbackUrl,
        deviceId: data.deviceId,
      });
      throw new Error(`Postback failed: ${response.status} ${errorText}`);
    }

    logger.info('Postback successful', {
      deviceId: data.deviceId,
      workflowId: data.workflowId,
    });
  } catch (error) {
    // Network errors, timeouts, etc.
    if (error instanceof Error && error.message.startsWith('Postback failed:')) {
      throw error; // Already formatted HTTP error
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Postback network error', {
      error: errorMessage,
      callbackUrl,
      deviceId: data.deviceId,
    });
    throw error; // Rethrow for caller to handle
  }
}
