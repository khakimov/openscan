/**
 * HTTPx Handler - HTTP Probing + Screenshots
 *
 * Probes HTTP services on specified ports to gather:
 * - HTTP status codes and headers
 * - Page titles and metadata
 * - Response times and TLS info
 * - Technology detection
 * - Screenshots
 *
 * Posts results back to user-application for database storage.
 */

import type { Env } from '../types/env';
import { createLogger } from '../utils/logger';
import { z } from 'zod';

/**
 * HTTPx request schema
 */
const HttpxRequestSchema = z.object({
  scanRunId: z.string().min(1),
  deviceId: z.string().min(1),
  organizationId: z.string().min(1),
  target: z.string().min(1), // IP or hostname
  ports: z.array(z.number().int().min(1).max(65535)),
  callbackUrl: z.string().url(),
});

type HttpxRequest = z.infer<typeof HttpxRequestSchema>;

/**
 * HTTPx probe result
 */
interface HttpxProbeResult {
  port: number;
  url: string;
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';

  // HTTP metadata
  scheme?: 'http' | 'https';
  statusCode?: number;
  title?: string;
  headers?: Record<string, string>;
  responseTime?: number; // milliseconds
  contentLength?: number;
  finalUrl?: string; // After redirects

  // TLS info
  tlsVersion?: string;

  // Server detection
  webServer?: string; // From Server header

  // Screenshot
  screenshot?: string; // R2 key

  // Tech detection (basic - from headers/html)
  technologies?: Array<{
    name: string;
    version?: string;
    confidence: 'high' | 'medium' | 'low';
  }>;

  // Error info
  error?: string;
  errorType?: 'CONNECTION_REFUSED' | 'TIMEOUT' | 'DNS_ERROR' | 'SSL_ERROR' | 'UNKNOWN';
}

/**
 * Main HTTPx handler
 */
export async function handleHttpx(
  request: Request,
  env: Env
): Promise<Response> {
  const logger = createLogger(env);

  // 1. Validate authentication
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.WORKER_API_KEY}`) {
    logger.warn('Unauthorized httpx request');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse and validate request
  let input: HttpxRequest;
  try {
    const body = await request.json();
    input = HttpxRequestSchema.parse(body);
  } catch (error) {
    logger.error('Invalid httpx request', { error });
    return Response.json(
      { error: 'Invalid request', details: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }

  logger.info('HTTPx probe request received', {
    scanRunId: input.scanRunId,
    deviceId: input.deviceId,
    target: input.target,
    portCount: input.ports.length,
  });

  // 3. Probe ports (parallel, max 5 concurrent)
  const results: HttpxProbeResult[] = [];
  const batchSize = 5;

  for (let i = 0; i < input.ports.length; i += batchSize) {
    const batch = input.ports.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((port) => probePort(port, input, env))
    );

    // Collect results (even failures)
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error('Probe batch failed', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  logger.info('HTTPx probing complete', {
    scanRunId: input.scanRunId,
    totalPorts: input.ports.length,
    successCount: results.filter((r) => r.status === 'SUCCESS').length,
    failedCount: results.filter((r) => r.status === 'FAILED').length,
    timeoutCount: results.filter((r) => r.status === 'TIMEOUT').length,
  });

  // 4. Postback results to user-application
  try {
    await postbackResults(input, results, env);
    logger.info('HTTPx results posted successfully', { scanRunId: input.scanRunId });
  } catch (error) {
    logger.error('Failed to postback httpx results', {
      scanRunId: input.scanRunId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't fail the request - results are captured
  }

  return Response.json({
    scanRunId: input.scanRunId,
    deviceId: input.deviceId,
    status: 'completed',
    portsProbed: input.ports.length,
    results: {
      success: results.filter((r) => r.status === 'SUCCESS').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      timeout: results.filter((r) => r.status === 'TIMEOUT').length,
    },
  });
}

/**
 * Probe a single port
 */
async function probePort(
  port: number,
  input: HttpxRequest,
  env: Env
): Promise<HttpxProbeResult> {
  const logger = createLogger(env);
  const startTime = Date.now();

  // Try HTTPS first, fallback to HTTP
  for (const scheme of ['https', 'http'] as const) {
    const url = `${scheme}://${input.target}:${port}`;

    try {
      logger.debug('Probing port', { port, url });

      // Probe with timeout (10 seconds per attempt)
      const result = await Promise.race([
        probeUrl(url, scheme, env),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        ),
      ]);

      const responseTime = Date.now() - startTime;

      return {
        ...result,
        port,
        url,
        status: 'SUCCESS',
        responseTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If HTTPS fails, try HTTP
      if (scheme === 'https') {
        logger.debug('HTTPS probe failed, trying HTTP', { port, error: errorMessage });
        continue;
      }

      // Both failed
      logger.warn('Port probe failed', { port, error: errorMessage });

      return {
        port,
        url: `http://${input.target}:${port}`,
        status: errorMessage.includes('Timeout') ? 'TIMEOUT' : 'FAILED',
        error: errorMessage,
        errorType: classifyError(errorMessage),
      };
    }
  }

  // Should never reach here
  return {
    port,
    url: `http://${input.target}:${port}`,
    status: 'FAILED',
    error: 'Unknown error',
    errorType: 'UNKNOWN',
  };
}

/**
 * Probe a specific URL
 */
async function probeUrl(
  url: string,
  scheme: 'http' | 'https',
  env: Env
): Promise<Partial<HttpxProbeResult>> {
  const logger = createLogger(env);

  // Fetch with follow redirects
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'openscan-httpx/1.0',
    },
  });

  // Extract headers
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Get response body for title extraction and tech detection
  const html = await response.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Basic tech detection from headers and HTML
  const technologies = detectTechnologies(headers, html);

  // Get web server from header
  const webServer = headers['server'];

  return {
    scheme,
    statusCode: response.status,
    title,
    headers,
    contentLength: html.length,
    finalUrl: response.url !== url ? response.url : undefined,
    webServer,
    technologies,
    tlsVersion: scheme === 'https' ? 'TLS 1.2+' : undefined, // TODO: Extract actual TLS version
  };
}

/**
 * Basic technology detection from headers and HTML
 */
function detectTechnologies(
  headers: Record<string, string>,
  html: string
): Array<{ name: string; version?: string; confidence: 'high' | 'medium' | 'low' }> {
  const techs: Array<{ name: string; version?: string; confidence: 'high' | 'medium' | 'low' }> = [];

  // Server header
  if (headers['server']) {
    const server = headers['server'];
    const match = server.match(/^([^\/\s]+)(?:\/([^\s]+))?/);
    if (match) {
      techs.push({
        name: match[1].toLowerCase(),
        version: match[2],
        confidence: 'high',
      });
    }
  }

  // X-Powered-By header
  if (headers['x-powered-by']) {
    const powered = headers['x-powered-by'];
    const match = powered.match(/^([^\/\s]+)(?:\/([^\s]+))?/);
    if (match) {
      techs.push({
        name: match[1].toLowerCase(),
        version: match[2],
        confidence: 'high',
      });
    }
  }

  // Framework detection from HTML meta tags and comments
  // React
  if (html.includes('react') || html.includes('React')) {
    techs.push({ name: 'react', confidence: 'medium' });
  }

  // Vue
  if (html.includes('vue') || html.includes('Vue')) {
    techs.push({ name: 'vue', confidence: 'medium' });
  }

  // WordPress
  if (html.includes('wp-content') || html.includes('wordpress')) {
    techs.push({ name: 'wordpress', confidence: 'high' });
  }

  // Next.js
  if (html.includes('__NEXT_DATA__') || html.includes('_next/')) {
    techs.push({ name: 'next.js', confidence: 'high' });
  }

  return techs;
}

/**
 * Classify error type
 */
function classifyError(errorMessage: string): HttpxProbeResult['errorType'] {
  if (errorMessage.toLowerCase().includes('timeout')) {
    return 'TIMEOUT';
  }
  if (errorMessage.toLowerCase().includes('refused')) {
    return 'CONNECTION_REFUSED';
  }
  if (errorMessage.toLowerCase().includes('dns') || errorMessage.toLowerCase().includes('enotfound')) {
    return 'DNS_ERROR';
  }
  if (errorMessage.toLowerCase().includes('ssl') || errorMessage.toLowerCase().includes('tls')) {
    return 'SSL_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * Postback results to user-application
 */
async function postbackResults(
  input: HttpxRequest,
  results: HttpxProbeResult[],
  env: Env
): Promise<void> {
  const logger = createLogger(env);

  const payload = {
    type: 'HTTPX',
    scanRunId: input.scanRunId,
    deviceId: input.deviceId,
    organizationId: input.organizationId,
    timestamp: new Date().toISOString(),
    status: 'SUCCESS',
    data: {
      target: input.target,
      probes: results,
    },
  };

  logger.debug('Posting httpx results', {
    url: input.callbackUrl,
    scanRunId: input.scanRunId,
    probeCount: results.length,
  });

  const response = await fetch(input.callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.USER_APP_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Postback failed: ${response.status} ${errorText}`);
  }

  logger.info('Postback successful', { scanRunId: input.scanRunId });
}
