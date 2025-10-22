/**
 * Screenshot Capture Handler
 *
 * Main handler for POST /screenshots/capture endpoint.
 *
 * Flow:
 * 1. Validate authentication
 * 2. Parse and validate request
 * 3. Capture screenshots (parallel, max 5 concurrent)
 * 4. Upload to R2
 * 5. Postback results to user-application
 */

import type { Env } from '../types/env';
import type { CaptureResponse, ScreenshotResult, Port } from '../types';
import { captureScreenshot } from '../services/browser-rendering';
import { uploadScreenshot, generateR2Key } from '../services/storage';
import { postResults } from '../services/postback';
import { validateAuthentication, parseRequestBody, validateCaptureRequest } from '../utils/validation';
import { handleError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Handle screenshot capture request
 *
 * POST /screenshots/capture
 */
export async function handleCapture(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();
  let jobId: string | undefined;

  try {
    // 1. Validate authentication
    validateAuthentication(request, env.WORKER_API_KEY);

    // 2. Parse and validate request
    const body = await parseRequestBody(request);
    const input = validateCaptureRequest(body);
    jobId = input.jobId;

    logger.info('Screenshot capture request received', {
      jobId: input.jobId,
      deviceId: input.deviceId,
      scanId: input.scanId,
      organizationId: input.organizationId,
      portCount: input.ports.length,
    });

    // 3. Capture screenshots for all ports (parallel with concurrency limit)
    const maxConcurrent = parseInt(env.MAX_CONCURRENT_SCREENSHOTS ?? '5', 10);
    const timeout = parseInt(env.MAX_SCREENSHOT_TIMEOUT_MS ?? '30000', 10);

    const screenshots = await capturePortsScreenshots(
      env,
      input.ports,
      {
        jobId: input.jobId,
        deviceId: input.deviceId,
        scanId: input.scanId,
        organizationId: input.organizationId,
      },
      { maxConcurrent, timeout }
    );

    // 4. Postback results to user-application
    await postResults(
      input.callbackUrl,
      {
        type: 'SCREENSHOT',
        jobId: input.jobId,
        deviceId: input.deviceId,
        scanId: input.scanId,
        organizationId: input.organizationId,
        screenshots,
        completedAt: new Date().toISOString(),
      },
      env.USER_APP_API_KEY
    );

    const duration = Date.now() - startTime;
    logger.info('Screenshot capture completed', {
      jobId: input.jobId,
      duration,
      totalScreenshots: screenshots.length,
      successCount: screenshots.filter((s) => s.status === 'SUCCESS').length,
      failedCount: screenshots.filter((s) => s.status === 'FAILED').length,
      timeoutCount: screenshots.filter((s) => s.status === 'TIMEOUT').length,
    });

    // 5. Return response
    const response: CaptureResponse = {
      jobId: input.jobId,
      status: 'processing',
      portsQueued: input.ports.length,
    };

    return Response.json(response, { status: 202 });
  } catch (error) {
    logger.error('Screenshot capture request failed', {
      jobId,
      duration: Date.now() - startTime,
      error,
    });
    return handleError(error, jobId);
  }
}

/**
 * Capture screenshots for multiple ports with concurrency control
 */
async function capturePortsScreenshots(
  env: Env,
  ports: Port[],
  context: {
    jobId: string;
    deviceId: string;
    scanId: string;
    organizationId: string;
  },
  options: { maxConcurrent: number; timeout: number }
): Promise<ScreenshotResult[]> {
  const results: ScreenshotResult[] = [];
  const { maxConcurrent, timeout } = options;

  // Process ports in batches
  for (let i = 0; i < ports.length; i += maxConcurrent) {
    const batch = ports.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((port) =>
        capturePortScreenshot(env, port, context, { timeout })
      )
    );

    // Convert PromiseSettledResult to ScreenshotResult
    batchResults.forEach((result, index) => {
      const port = batch[index];

      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Capture failed
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        results.push({
          port: port.port,
          url: port.httpDetection.url,
          status: error.includes('timeout') ? 'TIMEOUT' : 'FAILED',
          error,
          capturedAt: new Date().toISOString(),
        });
      }
    });
  }

  return results;
}

/**
 * Capture screenshot for a single port
 */
async function capturePortScreenshot(
  env: Env,
  port: Port,
  context: {
    jobId: string;
    deviceId: string;
    scanId: string;
    organizationId: string;
  },
  options: { timeout: number }
): Promise<ScreenshotResult> {
  const startTime = Date.now();
  const url = port.httpDetection.url;

  try {
    logger.info('Capturing screenshot', {
      jobId: context.jobId,
      port: port.port,
      url,
    });

    // 1. Capture screenshot
    const screenshot = await captureScreenshot(env.BROWSER, url, {
      timeout: options.timeout,
    });

    // 2. Generate R2 key
    const r2Key = generateR2Key(
      context.organizationId,
      context.deviceId,
      context.scanId,
      port.port
    );

    // 3. Upload to R2
    await uploadScreenshot(env.SCREENSHOTS, r2Key, screenshot.buffer, {
      organizationId: context.organizationId,
      deviceId: context.deviceId,
      scanId: context.scanId,
      port: port.port,
      url,
      capturedAt: new Date().toISOString(),
      viewport: `${screenshot.width}x${screenshot.height}`,
      fileSize: screenshot.buffer.byteLength,
    });

    const duration = Date.now() - startTime;

    logger.info('Screenshot captured and uploaded', {
      jobId: context.jobId,
      port: port.port,
      url,
      r2Key,
      duration,
      fileSize: screenshot.buffer.byteLength,
    });

    return {
      port: port.port,
      url,
      status: 'SUCCESS',
      r2Key,
      dimensions: {
        width: screenshot.width,
        height: screenshot.height,
      },
      fileSize: screenshot.buffer.byteLength,
      duration,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Screenshot capture failed', {
      jobId: context.jobId,
      port: port.port,
      url,
      duration,
      error: errorMessage,
    });

    return {
      port: port.port,
      url,
      status: errorMessage.includes('timeout') ? 'TIMEOUT' : 'FAILED',
      error: errorMessage,
      duration,
      capturedAt: new Date().toISOString(),
    };
  }
}
