/**
 * HTTPx Postback Handler
 *
 * Handles postback callbacks from restate-worker for httpx probing workflows.
 * Stores HTTP probe results, technology detections, and screenshots in the database.
 *
 * Screenshot Flow:
 * 1. restate-worker captures screenshots via httpx CLI (local filesystem)
 * 2. Screenshots read and base64 encoded in postback payload
 * 3. This handler decodes and uploads to R2
 * 4. R2 key stored in httpx_probes.screenshot field
 */

import { z } from 'zod';
import {
  createScanArtifact,
  updateArtifactStatus,
  createHttpxProbe,
  findOrCreateTechnology,
  createTechDetection,
} from '@repo/data-ops';
import type { PostbackHandler, HandlerContext, HandlerResult } from './base';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';
import {
  uploadScreenshot,
  generateR2Key,
} from '@/server/services/r2-storage';
import { env } from 'cloudflare:workers';

/**
 * Zod schema for httpx probe result validation
 */
const HttpxProbeResultSchema = z.object({
  port: z.number(),
  url: z.string(),
  status: z.enum(['SUCCESS', 'FAILED', 'TIMEOUT']),

  // HTTP metadata (optional - only present on SUCCESS)
  scheme: z.enum(['http', 'https']).optional(),
  statusCode: z.number().optional(),
  title: z.string().optional(),
  headers: z.record(z.string()).optional(),
  responseTime: z.number().optional(),
  contentLength: z.number().optional(),
  finalUrl: z.string().optional(),

  // TLS info
  tlsVersion: z.string().optional(),

  // Server detection
  webServer: z.string().optional(),

  // Screenshot
  screenshot: z.string().optional(), // Local file path (for debugging)
  screenshotBase64: z.string().optional(), // Base64 encoded screenshot for R2 upload

  // Tech detection
  technologies: z.array(z.object({
    name: z.string(),
    version: z.string().optional(),
    confidence: z.enum(['high', 'medium', 'low']),
  })).optional(),

  // Error info (only present on FAILED/TIMEOUT)
  error: z.string().optional(),
  errorType: z.enum(['CONNECTION_REFUSED', 'TIMEOUT', 'DNS_ERROR', 'SSL_ERROR', 'UNKNOWN']).optional(),
});

/**
 * Zod schema for httpx postback validation
 */
const HttpxPostbackSchema = z.object({
  type: z.literal('HTTPX'),
  scanRunId: z.string().min(1),
  deviceId: z.string().min(1),
  organizationId: z.string().min(1),
  timestamp: z.string(),
  status: z.enum(['SUCCESS', 'FAILURE']),
  data: z.object({
    target: z.string(),
    probes: z.array(HttpxProbeResultSchema),
  }),
});

export type HttpxPostback = z.infer<typeof HttpxPostbackSchema>;

/**
 * HTTPx Postback Handler
 */
export class HttpxPostbackHandler implements PostbackHandler<HttpxPostback> {
  readonly type = 'HTTPX' as const;
  readonly schema = HttpxPostbackSchema;

  /**
   * Validate postback payload
   */
  validate(payload: unknown): HttpxPostback {
    return this.schema.parse(payload);
  }

  /**
   * Handle httpx postback
   */
  async handle(payload: HttpxPostback, ctx: HandlerContext): Promise<HandlerResult> {
    if (payload.status === 'SUCCESS') {
      return this.handleSuccess(payload, ctx);
    } else {
      return this.handleFailure(payload, ctx);
    }
  }

  /**
   * Handle successful httpx probing
   */
  private async handleSuccess(
    payload: HttpxPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanRunId, deviceId, organizationId, data } = payload;

    ctx.logger.info('Processing httpx probe results', {
      scanRunId,
      deviceId,
      organizationId,
      probeCount: data.probes.length,
      successCount: data.probes.filter(p => p.status === 'SUCCESS').length,
    });

    // Store each probe result as a scan artifact
    let successCount = 0;
    let failedCount = 0;

    for (const probe of data.probes) {
      try {
        // Step 1: Create scan artifact (canonical record)
        const artifact = await createScanArtifact({
          scanRunId,
          deviceId,
          organizationId,
          toolName: 'httpx',
          port: probe.port,
          status: probe.status === 'SUCCESS' ? 'completed' : 'failed',
          metadata: {
            url: probe.url,
            errorType: probe.errorType,
          },
        });

        ctx.logger.debug('Created scan artifact', {
          artifactId: artifact.id,
          port: probe.port,
          status: probe.status,
        });

        // Step 2: If probe succeeded, upload screenshot and create httpx probe record
        if (probe.status === 'SUCCESS') {
          let r2Key: string | undefined;

          // Upload screenshot to R2 if base64 data is present
          if (probe.screenshotBase64 && env.SCREENSHOTS) {
            try {
              // Decode base64 to buffer
              const buffer = Buffer.from(probe.screenshotBase64, 'base64');

              // Generate R2 key
              const key = generateR2Key(
                organizationId,
                deviceId,
                scanRunId,
                probe.port
              );

              // Upload to R2
              r2Key = await uploadScreenshot(
                env.SCREENSHOTS,
                key,
                buffer,
                {
                  organizationId,
                  deviceId,
                  scanRunId,
                  port: probe.port,
                  url: probe.url,
                  capturedAt: payload.timestamp,
                  fileSize: buffer.byteLength,
                }
              );

              ctx.logger.info('Screenshot uploaded to R2', {
                key: r2Key,
                port: probe.port,
                sizeBytes: buffer.byteLength,
              });
            } catch (error) {
              // Non-critical - log error and continue without screenshot
              ctx.logger.error('Failed to upload screenshot to R2', {
                port: probe.port,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          const httpxProbe = await createHttpxProbe({
            artifactId: artifact.id,
            scheme: probe.scheme,
            statusCode: probe.statusCode,
            title: probe.title,
            screenshot: r2Key || probe.screenshot, // Use R2 key if uploaded, fallback to local path
            headers: probe.headers,
            responseTime: probe.responseTime,
            contentLength: probe.contentLength,
            finalUrl: probe.finalUrl,
            tlsVersion: probe.tlsVersion,
            webServer: probe.webServer,
          });

          ctx.logger.debug('Created httpx probe', {
            probeId: httpxProbe.id,
            statusCode: probe.statusCode,
            title: probe.title,
          });

          // Step 3: Store technology detections
          if (probe.technologies && probe.technologies.length > 0) {
            for (const tech of probe.technologies) {
              try {
                // Normalize and find/create technology
                const techId = await findOrCreateTechnology(
                  tech.name,
                  detectCategory(tech.name)
                );

                // Create detection junction record
                await createTechDetection({
                  probeId: httpxProbe.id,
                  technologyId: techId,
                  confidence: tech.confidence,
                  version: tech.version,
                });

                ctx.logger.debug('Stored technology detection', {
                  technology: tech.name,
                  version: tech.version,
                  confidence: tech.confidence,
                });
              } catch (error) {
                // Non-critical - log and continue
                ctx.logger.warn('Failed to store technology detection', {
                  technology: tech.name,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }

          successCount++;
        } else {
          // Probe failed - update artifact with error
          await updateArtifactStatus(
            artifact.id,
            'failed',
            probe.error || `${probe.status}: ${probe.errorType}`
          );
          failedCount++;
        }
      } catch (error) {
        ctx.logger.error('Failed to store probe result', {
          port: probe.port,
          error: error instanceof Error ? error.message : String(error),
        });
        failedCount++;
      }
    }

    ctx.logger.info('HTTPx results stored successfully', {
      scanRunId,
      deviceId,
      totalProbes: data.probes.length,
      successCount,
      failedCount,
    });

    // Build analytics
    const analytics = buildSuccessAnalytics(
      AnalyticsEventTypes.HTTPX_SUCCESS,
      {
        scanId: scanRunId,
        entityId: deviceId,
        organizationId,
        resultCount: successCount,
      }
    );

    return {
      success: true,
      message: `HTTPx probe results stored (${successCount} succeeded, ${failedCount} failed)`,
      analytics,
    };
  }

  /**
   * Handle failed httpx workflow
   */
  private async handleFailure(
    payload: HttpxPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanRunId, deviceId, organizationId } = payload;

    ctx.logger.warn('HTTPx workflow failed', {
      scanRunId,
      deviceId,
      organizationId,
    });

    // Build analytics
    const analytics = buildFailureAnalytics(
      AnalyticsEventTypes.HTTPX_FAILURE,
      {
        scanId: scanRunId,
        entityId: deviceId,
        error: 'HTTPx workflow failed',
      }
    );

    return {
      success: false,
      message: 'HTTPx workflow failed',
      analytics,
    };
  }
}

/**
 * Detect technology category from name
 */
function detectCategory(name: string): string {
  const lowerName = name.toLowerCase();

  // Web servers
  if (['nginx', 'apache', 'iis', 'lighttpd', 'caddy'].includes(lowerName)) {
    return 'web-server';
  }

  // Frameworks
  if (['react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte', 'express'].includes(lowerName)) {
    return 'framework';
  }

  // CMS
  if (['wordpress', 'drupal', 'joomla', 'magento', 'shopify'].includes(lowerName)) {
    return 'cms';
  }

  // Databases (from X-Powered-By headers)
  if (['mysql', 'postgresql', 'mongodb', 'redis', 'mariadb'].includes(lowerName)) {
    return 'database';
  }

  // Languages
  if (['php', 'python', 'node', 'ruby', 'java', 'go', 'dotnet', '.net'].includes(lowerName)) {
    return 'language';
  }

  return 'other';
}

/**
 * Singleton instance of the HTTPx postback handler
 */
export const httpxPostbackHandler = new HttpxPostbackHandler();
