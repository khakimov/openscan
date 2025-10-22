/**
 * Worker Environment Bindings
 *
 * This defines all bindings and environment variables available to the worker.
 *
 * CRITICAL: This worker has NO D1 binding - database writes happen in user-application only.
 */

export interface Env {
  // ===== Cloudflare Bindings =====

  /**
   * Browser Rendering API binding
   * Used to capture screenshots of web services
   */
  BROWSER: Fetcher;

  /**
   * R2 bucket for screenshot storage
   * Bucket: openscan-screenshots
   */
  SCREENSHOTS: R2Bucket;

  // ===== Secrets (set via wrangler secret put) =====

  /**
   * API key for authenticating incoming requests
   * Must match the key used by queue consumer in user-application
   * Set via: wrangler secret put WORKER_API_KEY
   */
  WORKER_API_KEY: string;

  /**
   * API key for authenticating postback requests to user-application
   * Must match user-application's WORKER_API_KEY
   * Set via: wrangler secret put USER_APP_API_KEY
   */
  USER_APP_API_KEY: string;

  // ===== Public Environment Variables =====

  /**
   * Environment name (production, staging, development)
   */
  ENVIRONMENT: string;

  /**
   * Worker version
   */
  VERSION: string;

  /**
   * Maximum time to wait for screenshot capture (milliseconds)
   * Default: 30000 (30 seconds)
   */
  MAX_SCREENSHOT_TIMEOUT_MS: string;

  /**
   * Maximum number of screenshots to capture concurrently
   * Default: 5
   */
  MAX_CONCURRENT_SCREENSHOTS: string;
}
