/**
 * Test Screenshot Handler
 *
 * Simple endpoint for testing screenshot capture.
 * POST /screenshots/test with { ip, port } and get back a signed URL.
 */

import type { Env } from '../types/env';
import { captureScreenshot } from '../services/browser-rendering';
import { uploadScreenshot, generateR2Key } from '../services/storage';
import { handleError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { z } from 'zod';

const logger = createLogger();

// Simple test request schema
const TestRequestSchema = z.object({
  ip: z.string().min(1), // Accept IP or hostname
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https']).optional(), // Auto-detect if not provided
});

type TestRequest = z.infer<typeof TestRequestSchema>;

interface TestResponse {
  success: true;
  url: string; // Signed R2 URL
  r2Key: string;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  duration: number;
}

/**
 * Handle test screenshot request
 *
 * POST /screenshots/test
 * Body: { ip: "1.2.3.4", port: 443, protocol?: "https" }
 * Response: { success: true, url: "https://...", ... }
 */
export async function handleTest(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  try {
    // Parse request
    const body = await request.json();
    const input = TestRequestSchema.parse(body);

    // Auto-detect protocol if not provided
    const protocol = input.protocol ?? detectProtocol(input.port);
    const url = `${protocol}://${input.ip}:${input.port}`;

    logger.info('Test screenshot request', { url, ip: input.ip, port: input.port });

    // 1. Capture screenshot
    const timeout = parseInt(env.MAX_SCREENSHOT_TIMEOUT_MS ?? '30000', 10);
    const screenshot = await captureScreenshot(env.BROWSER, url, { timeout });

    // 2. Generate R2 key
    const r2Key = generateR2Key(
      'test-org',
      'test-device',
      `test-${Date.now()}`,
      input.port
    );

    // 3. Upload to R2
    await uploadScreenshot(env.SCREENSHOTS, r2Key, screenshot.buffer, {
      organizationId: 'test-org',
      deviceId: 'test-device',
      scanId: `test-${Date.now()}`,
      port: input.port,
      url,
      capturedAt: new Date().toISOString(),
      viewport: `${screenshot.width}x${screenshot.height}`,
      fileSize: screenshot.buffer.byteLength,
    });

    // 4. Generate signed URL (valid for 1 hour)
    const signedUrl = await generateSignedUrl(env.SCREENSHOTS, r2Key, 3600);

    const duration = Date.now() - startTime;

    logger.info('Test screenshot completed', {
      url,
      r2Key,
      duration,
      fileSize: screenshot.buffer.byteLength,
    });

    const response: TestResponse = {
      success: true,
      url: signedUrl,
      r2Key,
      fileSize: screenshot.buffer.byteLength,
      dimensions: {
        width: screenshot.width,
        height: screenshot.height,
      },
      duration,
    };

    return Response.json(response);
  } catch (error) {
    logger.error('Test screenshot failed', {
      duration: Date.now() - startTime,
      error,
    });
    return handleError(error);
  }
}

/**
 * Auto-detect protocol based on common port numbers
 */
function detectProtocol(port: number): 'http' | 'https' {
  const httpsPort = [443, 8443, 9443];
  return httpsPort.includes(port) ? 'https' : 'http';
}

/**
 * Generate URL for viewing screenshot
 *
 * Since R2 doesn't support presigned URLs in Workers API,
 * we return a URL to the /view endpoint which proxies the image.
 */
async function generateSignedUrl(
  r2: R2Bucket,
  key: string,
  expiresIn: number
): Promise<string> {
  // Return URL to worker's /view endpoint
  // The view endpoint will fetch from R2 and return the image
  const viewUrl = `https://screenshot-worker.saipe.workers.dev/view/${encodeURIComponent(key)}`;
  return viewUrl;
}
