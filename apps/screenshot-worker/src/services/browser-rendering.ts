/**
 * Browser Rendering API Service
 *
 * Wrapper for Cloudflare Browser Rendering API to capture screenshots.
 *
 * API Reference: https://developers.cloudflare.com/browser-rendering/
 *
 * Note: Requires @cloudflare/puppeteer package
 */

import puppeteer from '@cloudflare/puppeteer';
import { CaptureTimeoutError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface ScreenshotOptions {
  /**
   * Maximum time to wait for screenshot (milliseconds)
   * Default: 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Viewport dimensions
   * Default: 1920x1080
   */
  viewport?: {
    width: number;
    height: number;
  };

  /**
   * Wait time before capturing (milliseconds)
   * Allows page to load dynamic content
   * Default: 2000 (2 seconds)
   */
  waitBeforeScreenshot?: number;
}

export interface ScreenshotResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  duration: number; // Milliseconds
}

/**
 * Capture screenshot of a URL using Browser Rendering API
 *
 * @param browser - Browser Rendering API binding (env.BROWSER)
 * @param url - URL to capture
 * @param options - Screenshot options
 * @returns Screenshot buffer and metadata
 * @throws CaptureTimeoutError if capture exceeds timeout
 * @throws Error if Browser Rendering API fails
 */
export async function captureScreenshot(
  browser: Fetcher,
  url: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 30000;
  const viewport = options.viewport ?? { width: 1920, height: 1080 };
  const waitTime = options.waitBeforeScreenshot ?? 2000;

  logger.info('Starting screenshot capture', {
    url,
    timeout,
    viewport,
    waitTime,
  });

  try {
    // Race between screenshot capture and timeout
    const result = await Promise.race([
      captureWithBrowser(browser, url, viewport, waitTime, timeout),
      timeoutPromise(timeout, url),
    ]);

    const duration = Date.now() - startTime;

    logger.info('Screenshot captured successfully', {
      url,
      duration,
      width: result.width,
      height: result.height,
      fileSize: result.buffer.byteLength,
    });

    return {
      ...result,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Screenshot capture failed', {
      url,
      duration,
      error,
    });
    throw error;
  }
}

/**
 * Internal function to capture screenshot using Browser Rendering API
 */
async function captureWithBrowser(
  browserBinding: Fetcher,
  url: string,
  viewport: { width: number; height: number },
  waitTime: number,
  timeout: number
): Promise<Pick<ScreenshotResult, 'buffer' | 'width' | 'height'>> {
  let browser;
  let page;

  try {
    logger.info('Launching browser', { url });

    // Launch browser using Cloudflare's Browser Rendering API
    browser = await puppeteer.launch(browserBinding);
    logger.info('Browser launched successfully');

    page = await browser.newPage();
    logger.info('New page created');

    // Set viewport size
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
    });

    // Navigate to URL
    // Use 'load' instead of 'networkidle0' for faster, more reliable loading
    // networkidle0 can timeout on sites with long-polling or streaming
    await page.goto(url, {
      waitUntil: 'load', // Wait for page load event (faster than networkidle0)
      timeout: timeout - 2000, // Leave 2s buffer for screenshot capture
    });

    // Wait for dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    // Capture screenshot (returns Buffer when encoding is 'binary')
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: false, // Only capture viewport (not full scrollable page)
      encoding: 'binary', // Returns Buffer instead of base64 string
    });

    // Type guard: ensure we got a Buffer
    if (typeof screenshotBuffer === 'string') {
      throw new Error('Screenshot returned base64 string instead of Buffer');
    }

    // Convert Buffer to ArrayBuffer (cast to avoid SharedArrayBuffer type)
    const arrayBuffer = screenshotBuffer.buffer.slice(
      screenshotBuffer.byteOffset,
      screenshotBuffer.byteOffset + screenshotBuffer.byteLength
    ) as ArrayBuffer;

    return {
      buffer: arrayBuffer,
      width: viewport.width,
      height: viewport.height,
    };
  } finally {
    // Cleanup: close page and browser
    if (page) {
      await page.close().catch((err) => logger.warn('Failed to close page', { err }));
    }
    if (browser) {
      await browser.close().catch((err) => logger.warn('Failed to close browser', { err }));
    }
  }
}

/**
 * Create a timeout promise
 */
function timeoutPromise(timeout: number, url: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new CaptureTimeoutError(url, timeout));
    }, timeout);
  });
}

/**
 * Batch capture screenshots with concurrency limit
 *
 * @param browser - Browser Rendering API binding
 * @param urls - URLs to capture
 * @param maxConcurrent - Maximum concurrent captures (default: 5)
 * @param options - Screenshot options
 * @returns Array of results (resolved or rejected)
 */
export async function batchCaptureScreenshots(
  browser: Fetcher,
  urls: string[],
  maxConcurrent = 5,
  options: ScreenshotOptions = {}
): Promise<PromiseSettledResult<ScreenshotResult>[]> {
  const results: PromiseSettledResult<ScreenshotResult>[] = [];

  // Process URLs in batches
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map((url) => captureScreenshot(browser, url, options))
    );
    results.push(...batchResults);
  }

  return results;
}
