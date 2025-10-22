/**
 * Postback Service
 *
 * Posts screenshot results back to user-application.
 *
 * The user-application will:
 * - Update scan_runs.resultSummary.screenshots
 * - Update screenshot_jobs table
 * - Maintain single source of truth for database
 */

import type { ScreenshotPostback } from '../types';
import { PostbackError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Post screenshot results to user-application
 *
 * @param callbackUrl - User-application endpoint (e.g., /api/internal/screenshot-results)
 * @param payload - Screenshot results payload
 * @param apiKey - Authentication key for user-application
 * @throws PostbackError if postback fails after retries
 */
export async function postResults(
  callbackUrl: string,
  payload: ScreenshotPostback,
  apiKey: string
): Promise<void> {
  logger.info('Posting results to user-application', {
    callbackUrl,
    jobId: payload.jobId,
    screenshotCount: payload.screenshots.length,
  });

  try {
    const response = await fetchWithRetry(callbackUrl, payload, apiKey, {
      maxAttempts: 2,
      retryDelay: 1000,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    logger.info('Postback successful', {
      jobId: payload.jobId,
      status: response.status,
    });
  } catch (error) {
    logger.error('Postback failed', {
      callbackUrl,
      jobId: payload.jobId,
      error,
    });

    throw new PostbackError('Failed to post results to user-application', {
      callbackUrl,
      jobId: payload.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  payload: ScreenshotPostback,
  apiKey: string,
  options: { maxAttempts: number; retryDelay: number }
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      logger.debug('Postback attempt', { url, attempt, maxAttempts: options.maxAttempts });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      // Return response (caller will check if ok)
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn('Postback attempt failed', {
        url,
        attempt,
        error: lastError.message,
      });

      // Wait before retry (except on last attempt)
      if (attempt < options.maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelay));
      }
    }
  }

  // All attempts failed
  throw lastError ?? new Error('All postback attempts failed');
}
