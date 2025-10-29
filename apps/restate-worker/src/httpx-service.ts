/**
 * HTTPx Service - Restate Implementation
 *
 * Probes HTTP/HTTPS services on discovered ports using httpx CLI tool.
 * Captures:
 * - HTTP metadata (status code, title, headers, response time)
 * - Screenshots (using httpx built-in headless browser)
 * - Technology detection (web server, frameworks)
 *
 * This service is triggered after port scanning completes for ports likely to be HTTP/HTTPS.
 *
 * Screenshot Storage:
 * - Currently: Local file paths stored in database (e.g., ~/.config/httpx/screenshot/example.com_443.png)
 * - Future: Upload to R2 and store R2 keys (requires S3-compatible client or separate upload worker)
 */

import * as restate from '@restatedev/restate-sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import { postUniversalPostback } from './postback';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'restate-httpx' });

// State management for httpx probing tracking
interface HttpxProbeState {
  scanId: string;
  target: string;
  status: 'VALIDATING' | 'PROBING' | 'COMPLETED' | 'FAILED';
  portsProbed?: number;
  successCount?: number;
  failedCount?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const stateStore = new Map<string, HttpxProbeState>();

/**
 * HTTPx Probe Result (from JSON output)
 */
interface HttpxProbeResult {
  host: string;
  url: string;
  port?: number;
  scheme?: string;
  status_code?: number;
  title?: string;
  webserver?: string;
  content_type?: string;
  content_length?: number;
  response_time?: string; // e.g., "339.107572ms"
  final_url?: string;
  tls?: {
    version?: string;
    cipher?: string;
  };
  header?: Record<string, string[]>;
  screenshot_path?: string; // Absolute file path to screenshot
  screenshot_path_rel?: string; // Relative path
  tech?: string[]; // Technology detection
  failed?: boolean;
  error?: string;
}

/**
 * HTTPx Service
 */
export const httpxService = restate.service({
  name: 'Httpx',
  handlers: {
    /**
     * Probe HTTP/HTTPS services on given ports
     *
     * @param ctx - Restate context
     * @param input - Probe configuration
     */
    probe: restate.handlers.handler(
      {
        inactivityTimeout: 600000, // 10 minutes (httpx with screenshots can be slow)
        abortTimeout: 120000, // 2 minutes
      },
      async (
        ctx,
        input: {
          target: string; // IP or domain
          ports: number[]; // List of ports to probe
          scanRunId: string; // Scan run ID for linking results
          deviceId: string; // Device ID
          organizationId: string; // Tenant ID
          callbackUrl: string; // Where to POST results
          screenshotsEnabled?: boolean; // Enable screenshot capture (default: true)
          timeout?: number; // Per-request timeout in seconds (default: 10)
        }
      ) => {
        const scanId = input.scanRunId;
        const startTime = Date.now();

        // Initialize state
        const state: HttpxProbeState = {
          scanId,
          target: input.target,
          status: 'VALIDATING',
          startedAt: new Date().toISOString(),
        };
        stateStore.set(scanId, state);

        logger.info('Starting HTTPx probing', {
          scanId,
          target: input.target,
          ports: input.ports,
          portsCount: input.ports.length,
        });

        // Validate input
        if (!input.target || input.target.trim().length === 0) {
          throw new Error('Target is required');
        }

        // Validate target format (hostname or IP, no shell metacharacters)
        const targetPattern = /^[a-zA-Z0-9.-]+$/;
        if (!targetPattern.test(input.target)) {
          throw new Error('Invalid target format');
        }

        if (!input.ports || input.ports.length === 0) {
          throw new Error('At least one port is required');
        }

        // Limit number of ports to prevent resource exhaustion
        if (input.ports.length > 100) {
          throw new Error('Maximum 100 ports allowed per request');
        }

        // Validate all ports are valid numbers
        for (const port of input.ports) {
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port: ${port}`);
          }
        }

        if (!input.callbackUrl) {
          throw new Error('Callback URL is required');
        }

        // Validate callbackUrl is a valid HTTPS URL
        try {
          const url = new URL(input.callbackUrl);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('Callback URL must use HTTP or HTTPS');
          }
        } catch (error) {
          throw new Error('Invalid callback URL format');
        }

        // Step 1: Run httpx CLI tool (durable)
        const probeResults = await ctx.run('run-httpx', async () => {
          state.status = 'PROBING';
          stateStore.set(scanId, state);

          logger.info('Running httpx CLI', {
            scanId,
            target: input.target,
            ports: input.ports,
          });

          try {
            const results = await runHttpx({
              target: input.target,
              ports: input.ports,
              screenshotsEnabled: input.screenshotsEnabled ?? true,
              timeout: input.timeout ?? 10,
            });

            logger.info('HTTPx CLI completed', {
              scanId,
              resultsCount: results.length,
              successCount: results.filter((r) => !r.failed).length,
              failedCount: results.filter((r) => r.failed).length,
            });

            return results;
          } catch (error: any) {
            logger.error('HTTPx CLI failed', {
              scanId,
              error: error.message,
            });
            throw error;
          }
        });

        // Step 2: Process and format results
        const processedProbes = probeResults.map((result) => {
          if (result.failed) {
            return {
              port: result.port || 0,
              url: result.url,
              status: 'FAILED' as const,
              error: result.error || 'Unknown error',
              errorType: detectErrorType(result.error),
            };
          }

          // Extract response time in milliseconds
          const responseTime = result.response_time
            ? parseInt(result.response_time.replace('ms', ''))
            : undefined;

          // Validate screenshot path (prevent path traversal)
          let screenshotPath = result.screenshot_path;
          if (screenshotPath && screenshotPath.includes('..')) {
            logger.warn('Suspicious screenshot path detected', { path: screenshotPath });
            screenshotPath = undefined;
          }

          return {
            port: result.port || 0,
            url: result.url,
            status: 'SUCCESS' as const,
            scheme: result.scheme,
            statusCode: result.status_code,
            title: result.title,
            headers: result.header ? flattenHeaders(result.header) : undefined,
            responseTime,
            contentLength: result.content_length,
            finalUrl: result.final_url,
            tlsVersion: result.tls?.version,
            webServer: result.webserver,
            screenshot: screenshotPath, // Absolute file path (e.g., /root/openscan/apps/restate-worker/output/screenshot/example.com/hash.png)
            technologies: result.tech?.map((name) => ({
              name,
              confidence: 'medium' as const, // httpx doesn't provide confidence
            })),
          };
        });

        const successCount = processedProbes.filter((p) => p.status === 'SUCCESS').length;
        const failedCount = processedProbes.filter((p) => p.status === 'FAILED').length;

        // Update state
        state.status = 'COMPLETED';
        state.portsProbed = input.ports.length;
        state.successCount = successCount;
        state.failedCount = failedCount;
        state.completedAt = new Date().toISOString();
        stateStore.set(scanId, state);

        const duration = Date.now() - startTime;

        logger.info('HTTPx probing completed', {
          scanId,
          target: input.target,
          portsProbed: input.ports.length,
          successCount,
          failedCount,
          duration,
        });

        // Step 3: Postback results (durable)
        await ctx.run('postback-results', async () => {
          logger.info('Posting httpx results back to server', {
            scanId,
            callbackUrl: input.callbackUrl,
            deviceId: input.deviceId,
          });

          // Note: The postback uses 'scanId' but the handler expects 'scanRunId'
          // We pass scanRunId as scanId and the handler will read it correctly
          const postbackPayload: any = {
            type: 'HTTPX',
            scanRunId: scanId, // Handler expects scanRunId
            deviceId: input.deviceId,
            organizationId: input.organizationId,
            timestamp: new Date().toISOString(),
            status: 'SUCCESS',
            data: {
              target: input.target,
              probes: processedProbes,
            },
          };

          await fetch(input.callbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.WORKER_API_KEY}`,
            },
            body: JSON.stringify(postbackPayload),
          }).then(async (response) => {
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Postback failed: ${response.status} ${errorText}`);
            }
          });

          logger.info('Postback successful', {
            scanId,
            deviceId: input.deviceId,
          });
        });

        return {
          scanId,
          target: input.target,
          probes: processedProbes,
          totalProbes: input.ports.length,
          successCount,
          failedCount,
          duration,
          completedAt: new Date().toISOString(),
        };
      }
    ),

    /**
     * Get probe state (for polling)
     */
    getState: async (_ctx, input: { scanId: string }) => {
      return stateStore.get(input.scanId) || null;
    },
  },
});

/**
 * Run httpx CLI tool
 */
async function runHttpx(options: {
  target: string;
  ports: number[];
  screenshotsEnabled: boolean;
  timeout: number;
}): Promise<HttpxProbeResult[]> {
  const { target, ports, screenshotsEnabled, timeout } = options;

  // Find httpx binary
  const httpxPath = findHttpxBinary();

  // Build target URLs with ports
  const targets = ports.map((port) => {
    // Try both http and https schemes
    return [`http://${target}:${port}`, `https://${target}:${port}`];
  }).flat();

  // Build httpx arguments
  const args = [
    '-json', // JSON output
    '-no-color', // No ANSI colors
    '-timeout', `${timeout}`, // Timeout per request
    '-retries', '1', // Single retry
    '-tech-detect', // Detect technologies
    '-status-code', // Include status code
    '-title', // Extract page title
    '-web-server', // Detect web server
    '-response-time', // Measure response time
    '-content-length', // Get content length
    '-follow-redirects', // Follow redirects
    '-max-redirects', '3', // Max redirect hops
    // Note: Not using -silent because it can cause buffering issues with Chrome screenshots
  ];

  // Add screenshot flags if enabled
  if (screenshotsEnabled) {
    args.push('-screenshot'); // Enable screenshots
    args.push('-system-chrome'); // Use system Chrome (required for headless)
    args.push('-screenshot-timeout', `${timeout}s`); // Screenshot timeout
  }

  // Add target URLs with -u flag for each
  for (const target of targets) {
    args.push('-u', target);
  }

  logger.info('Executing httpx', {
    binary: httpxPath,
    target,
    ports,
    screenshotsEnabled,
    timeout,
    targetCount: targets.length,
  });

  try {
    // Calculate total timeout with reasonable cap (max 10 minutes)
    // Screenshots take much longer, so give more time per target
    const timePerTarget = screenshotsEnabled ? 30 : (timeout + 5);
    const totalTimeout = Math.min(
      timePerTarget * 1000 * targets.length,
      10 * 60 * 1000 // 10 minutes max
    );

    const { stdout, stderr } = await execFileAsync(httpxPath, args, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large JSON output
      timeout: totalTimeout,
    });

    if (stderr) {
      logger.warn('HTTPx stderr output', { stderr: stderr.substring(0, 500) });
    }

    // Parse JSON output (one JSON object per line)
    const lines = stdout.trim().split('\n').filter((line) => line.trim().length > 0);
    const results: HttpxProbeResult[] = [];

    for (const line of lines) {
      try {
        const result = JSON.parse(line);
        results.push(result);
      } catch (error) {
        logger.warn('Failed to parse httpx JSON line', {
          line: line.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  } catch (error: any) {
    logger.error('HTTPx execution failed', {
      error: error.message,
      stderr: error.stderr?.substring(0, 500),
    });

    // Return failed results for all ports
    return ports.map((port) => ({
      host: target,
      url: `http://${target}:${port}`,
      port,
      failed: true,
      error: error.message || 'HTTPx execution failed',
    }));
  }
}

/**
 * Find httpx binary in PATH or common locations
 */
function findHttpxBinary(): string {
  // Check PATH first
  const pathBinary = 'httpx';

  // Common installation locations
  const locations = [
    pathBinary, // In PATH
    `${process.env.HOME}/go/bin/httpx`,
    '/usr/local/go/bin/httpx',
    '/usr/local/bin/httpx',
  ];

  // Return first match (for now just return 'httpx' and let execFile resolve it)
  return pathBinary;
}

/**
 * Flatten header arrays to single values (httpx returns arrays)
 */
function flattenHeaders(headers: Record<string, string[]>): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const [key, values] of Object.entries(headers)) {
    flattened[key] = values.join(', ');
  }

  return flattened;
}

/**
 * Detect error type from error message
 */
function detectErrorType(
  error?: string
): 'CONNECTION_REFUSED' | 'TIMEOUT' | 'DNS_ERROR' | 'SSL_ERROR' | 'UNKNOWN' {
  if (!error) return 'UNKNOWN';

  const lowerError = error.toLowerCase();

  if (lowerError.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }

  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return 'TIMEOUT';
  }

  if (lowerError.includes('dns') || lowerError.includes('no such host')) {
    return 'DNS_ERROR';
  }

  if (
    lowerError.includes('ssl') ||
    lowerError.includes('tls') ||
    lowerError.includes('certificate')
  ) {
    return 'SSL_ERROR';
  }

  return 'UNKNOWN';
}
