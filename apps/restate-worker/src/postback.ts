/**
 * Postback helper for posting scan results to server
 *
 * Used by Restate services to POST results back to TanStack Start API
 * when scans complete. Supports universal postback format with type discrimination.
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'restate-postback' });

/**
 * Legacy Payload for postback (PORT_SCAN type)
 * Will be deprecated in favor of typed payloads
 */
export interface PostbackPayload {
  callbackUrl: string;
  deviceId: string;
  scanId: string; // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
  results: any; // Port scan results
  organizationId?: string; // Optional: will be required in future
}

/**
 * Universal Postback Payload (Type-Safe)
 * New format that includes type discrimination for routing
 */
export interface UniversalPostbackPayload {
  type: 'PORT_SCAN' | 'DISCOVERY';
  scanId: string;
  organizationId: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILURE';
  callbackUrl: string;
  data: any; // Type-specific data (ports for PORT_SCAN, devices for DISCOVERY)
  deviceId?: string; // Only for PORT_SCAN
  error?: string; // Only for FAILURE status
}

/**
 * Posts scan results to server callback URL (LEGACY)
 * Uses WORKER_API_KEY for authentication
 * Throws on failure (caller should handle retries)
 *
 * @deprecated Use postUniversalPostback for new code
 */
export async function postbackScanResults(payload: PostbackPayload): Promise<void> {
  const { callbackUrl, organizationId, ...data } = payload;

  logger.info('Posting scan results to server (legacy format)', {
    callbackUrl,
    deviceId: data.deviceId,
    scanId: data.scanId,
    resultsType: data.results?.constructor?.name || typeof data.results,
  });

  // Convert legacy format to universal format
  const universalPayload: UniversalPostbackPayload = {
    type: 'PORT_SCAN',
    scanId: data.scanId,
    organizationId: organizationId || 'UNKNOWN', // TODO: Make required
    timestamp: new Date().toISOString(),
    status: 'SUCCESS',
    callbackUrl,
    deviceId: data.deviceId,
    data: data.results,
  };

  return postUniversalPostback(universalPayload);
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
