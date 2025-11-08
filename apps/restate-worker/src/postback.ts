/**
 * Postback helper for posting scan results to server
 *
 * Used by Restate services to POST results back to TanStack Start API
 * when scans complete. Supports universal postback format with type discrimination.
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-postback' });

/**
 * Universal Postback Payload (Type-Safe)
 * Format with type discrimination for routing to appropriate handlers
 */
export interface UniversalPostbackPayload {
  type: 'PORT_SCAN' | 'DISCOVERY' | 'HTTPX' | 'SCHEDULED_SCAN_EXECUTED' | 'SCHEDULE_AUTO_PAUSED';
  scanId: string;
  organizationId: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILURE' | 'FAILED';
  callbackUrl: string;
  data: any; // Type-specific data (ports for PORT_SCAN, devices for DISCOVERY, probes for HTTPX, schedule updates for SCHEDULED_SCAN)
  deviceId?: string; // For PORT_SCAN, HTTPX, and SCHEDULED_SCAN
  error?: string; // Only for FAILURE/FAILED status
}

/**
 * Posts results using universal postback format
 * Supports type discrimination for PORT_SCAN, DISCOVERY, etc.
 * Uses WORKER_API_KEY for authentication
 * Throws on failure (caller should handle retries)
 */
export async function postUniversalPostback(payload: UniversalPostbackPayload): Promise<void> {
  const { callbackUrl, ...data } = payload;

  logger.info('Posting results to server (universal format)', {
    callbackUrl,
    type: data.type,
    scanId: data.scanId,
    status: data.status,
    organizationId: data.organizationId,
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
      scanId: data.scanId,
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
