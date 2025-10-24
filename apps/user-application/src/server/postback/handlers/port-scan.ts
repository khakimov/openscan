/**
 * Port Scan Postback Handler
 *
 * Handles postback callbacks from restate-worker for port scan workflows.
 * Stores scan results in the database and updates workflow status.
 */

import { z } from 'zod';
import {
  updateDevice,
  getScanRunByRestateWorkflowId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
} from '@repo/data-ops';
import type { PostbackHandler, HandlerContext, HandlerResult } from './base';
import type { PortScanPostback } from '../types';
import type { CVEEnrichment } from '@repo/data-ops';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';
import {
  createNectoAPIClient,
  type NectoAPIClient,
} from '@/server/discovery/services/necto-api-client';

/**
 * Necto API client singleton
 * Reused across postback requests for efficiency
 */
let nectoClientInstance: NectoAPIClient | null = null;

function getNectoAPIClient(): NectoAPIClient {
  if (!nectoClientInstance) {
    nectoClientInstance = createNectoAPIClient({
      baseUrl: process.env.NECTO_API_URL || 'http://127.0.0.1:5020',
      timeout: 30000,
      retries: 2, // Lower retries in postback to avoid blocking too long
    });
  }
  return nectoClientInstance;
}

/**
 * Reset Necto client singleton (for testing)
 * @internal
 */
export function resetNectoClientForTesting(): void {
  nectoClientInstance = null;
}

/**
 * Zod schema for port scan postback validation
 */
const PortScanPostbackSchema = z.object({
  type: z.literal('PORT_SCAN'),
  scanId: z.string().min(1, 'scanId is required'),
  organizationId: z.string().min(1, 'organizationId is required'),
  timestamp: z.string(),
  status: z.enum(['SUCCESS', 'FAILURE']),
  deviceId: z.string().min(1, 'deviceId is required'),
  data: z.object({
    target: z.string(),
    ports: z.array(
      z.object({
        port: z.number(),
        protocol: z.enum(['tcp', 'udp']),
        state: z.enum(['open', 'closed', 'filtered']),
        service: z.object({
          name: z.string().optional(),
          product: z.string().optional().nullable(),
          version: z.string().optional().nullable(),
          extraInfo: z.string().optional().nullable(),
          method: z.string().optional(),
          confidence: z.number().optional(),
        }).passthrough().optional(), // Keep all service fields from Restate worker
        version: z.string().optional(),
      }).passthrough() // Allow extra fields like discoveredBy, firstSeen, lastSeen
    ),
    osInfo: z
      .object({
        name: z.string().optional(),
        version: z.string().optional(),
        accuracy: z.number().optional(),
        cpe: z.array(z.string()).optional(),
      })
      .optional(),
    timing: z
      .object({
        start: z.number().optional(),
        end: z.number().optional(),
        elapsed: z.number().optional(),
      })
      .optional(),
    scanMetadata: z
      .object({
        scanner: z.string().optional(),
        version: z.string().optional(),
        arguments: z.string().optional(),
        duration: z.number().optional(),
        resolvedTarget: z.string().optional(),
      })
      .optional(),
  }),
  error: z.string().optional(),
});

/**
 * Port Scan Postback Handler
 *
 * Processes postback callbacks from port scan workflows.
 * Handles both successful and failed scans.
 */
export class PortScanPostbackHandler
  implements PostbackHandler<PortScanPostback>
{
  readonly type = 'PORT_SCAN';
  readonly schema = PortScanPostbackSchema;

  async handle(
    payload: PortScanPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, deviceId, organizationId, data, status, error } = payload;

    ctx.logger.info('Processing port scan postback', {
      scanId,
      deviceId,
      organizationId,
      status,
      portCount: data?.ports?.length || 0,
    });

    try {
      // Handle failure case
      if (status === 'FAILURE') {
        return await this.handleFailure(
          { scanId, deviceId, organizationId, error: error || 'Unknown error' },
          ctx
        );
      }

      // Handle success case
      return await this.handleSuccess(
        { scanId, deviceId, organizationId, data },
        ctx
      );
    } catch (error) {
      ctx.logger.error('Failed to process port scan postback', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        scanId,
        deviceId,
      });

      return {
        success: false,
        message: 'Failed to process port scan postback',
        analytics: buildFailureAnalytics(AnalyticsEventTypes.PORTSCAN_FAILURE, {
          scanId,
          entityId: deviceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }
  }

  /**
   * Handle successful port scan
   */
  private async handleSuccess(
    params: {
      scanId: string;
      deviceId: string;
      organizationId: string;
      data: PortScanPostback['data'];
    },
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, deviceId, organizationId, data } = params;

    ctx.logger.info('Storing scan results', {
      deviceId,
      scanId,
      organizationId,
      portCount: data.ports?.length || 0,
    });

    // Step 1: Find the scan run by Restate workflow ID (workflow data is now embedded)
    const scanRun = await getScanRunByRestateWorkflowId(organizationId, scanId);

    if (!scanRun) {
      ctx.logger.warn('Scan run not found for postback', {
        scanId,
        organizationId,
      });

      return {
        success: false,
        message: `Scan run not found: ${scanId}`,
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.PORTSCAN_DEVICE_NOT_FOUND,
          {
            scanId,
            entityId: deviceId,
            error: 'Scan run not found',
          }
        ),
      };
    }

    // Universal filtering: only store ports with service information
    const allOpenPorts = data.ports?.filter((p) => p.state === 'open') || [];
    const portsWithService = allOpenPorts.filter((p) => p.service?.name || p.service?.product);
    const portsWithoutService = allOpenPorts.length - portsWithService.length;

    // Calculate detection rate for metadata
    const serviceDetectionRate = allOpenPorts.length > 0
      ? (portsWithService.length / allOpenPorts.length) * 100
      : 0;

    // Detect suspicious pattern (for metadata/logging only)
    const suspiciousAllPortsOpen = allOpenPorts.length > 1000 && serviceDetectionRate < 1;

    // Minimal logging - only important cases
    if (suspiciousAllPortsOpen) {
      ctx.logger.warn('Suspicious scan pattern detected', {
        scanId,
        openPorts: allOpenPorts.length,
        servicesDetected: portsWithService.length,
        pattern: 'Possible WAF/Proxy',
      });
    } else if (portsWithoutService > 10) {
      ctx.logger.info('Filtered ports without service info', {
        scanId,
        filtered: portsWithoutService,
        stored: portsWithService.length,
      });
    }

    // Store only ports with services
    let openPorts = portsWithService;

    // Safety cap at 1000 ports
    const MAX_PORTS = 1000;
    if (openPorts.length > MAX_PORTS) {
      ctx.logger.warn('Storage limit applied', {
        scanId,
        servicesFound: openPorts.length,
        storingFirst: MAX_PORTS,
      });
      openPorts = openPorts.slice(0, MAX_PORTS);
    }

    const timestamp = new Date().toISOString();

    // Step 3: CVE Enrichment (synchronous, always-on)
    let cveEnrichment: CVEEnrichment | undefined;

    // Natural behavior - skip if no ports to enrich
    const hasOpenPorts = openPorts.length > 0;
    const hasOSInfo = !!data.osInfo?.name;

    if (hasOpenPorts || hasOSInfo) {
      try {
        const nectoClient = getNectoAPIClient();
        cveEnrichment = await nectoClient.enrichScanResults(
          openPorts,
          data.osInfo
        );

        ctx.logger.info('CVE enrichment completed', {
          scanId,
          totalCves: cveEnrichment.summary.totalCves,
          criticalCount: cveEnrichment.summary.totalCritical,
          highCount: cveEnrichment.summary.totalHigh,
        });
      } catch (error) {
        // Don't fail scan if enrichment fails
        ctx.logger.error(
          'CVE enrichment failed, continuing without enrichment',
          {
            scanId,
            error: error instanceof Error ? error.message : String(error),
            errorDetails: error instanceof Error && (error as any).details ? (error as any).details : undefined,
            errorResponse: error instanceof Error && (error as any).response ? JSON.stringify((error as any).response) : undefined,
            errorStack: error instanceof Error ? error.stack : undefined,
            errorType: error?.constructor?.name,
          }
        );
        // cveEnrichment remains undefined
      }
    } else {
      ctx.logger.info('Skipped CVE enrichment - no services detected', {
        scanId,
        openPortsTotal: allOpenPorts.length,
      });
    }

    // Step 4: Store results in scan run with port details and CVE enrichment
    const resultSummary = {
      target: data.target,

      // Port statistics
      openPortCount: allOpenPorts.length,
      portsStoredCount: openPorts.length,
      portsFilteredCount: portsWithoutService,
      ports: openPorts, // Only ports with services

      // Detection metadata for UI
      serviceDetectionRate,
      suspiciousAllPortsOpen,
      scanPattern: suspiciousAllPortsOpen ? 'WAF/Proxy' : 'Normal',

      // Standard fields
      timing: data.timing,
      scanMetadata: data.scanMetadata,
      osInfo: data.osInfo,
      completedAt: timestamp,
      cveEnrichment,
    };

    // Validate result summary size before storing
    const resultSummaryJson = JSON.stringify(resultSummary);
    const resultSizeMB = resultSummaryJson.length / 1024 / 1024;

    ctx.logger.info('Storing result summary', {
      scanRunId: scanRun.id,
      portsStored: openPorts.length,
      resultSizeMB: resultSizeMB.toFixed(2),
    });

    // Warn if result summary is approaching size limits (D1 has practical limits)
    if (resultSizeMB > 0.5) {
      ctx.logger.warn('Large result summary detected', {
        scanId,
        resultSizeMB: resultSizeMB.toFixed(2),
        portsStored: openPorts.length,
      });
    }

    // Store results with error handling
    try {
      await updateScanRunStatus(scanRun.id, 'SUCCEEDED', resultSummary);
    } catch (error) {
      ctx.logger.error('Failed to store scan run status', {
        scanId,
        scanRunId: scanRun.id,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        resultSizeMB: resultSizeMB.toFixed(2),
      });
      throw error; // Re-throw to trigger postback retry
    }

    // Step 5: Update workflow status
    ctx.logger.info('Updating workflow status to SUCCEEDED', {
      scanRunId: scanRun.id,
      restateWorkflowId: scanRun.restateWorkflowId,
      organizationId,
    });
    try {
      await updateScanWorkflowStatus(scanRun.id, 'SUCCEEDED');
    } catch (error) {
      ctx.logger.error('Failed to update workflow status', {
        scanId,
        scanRunId: scanRun.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Re-throw to trigger postback retry
    }

    // Step 6: Update device with scan metadata
    // Note: lastSeenAt is not in DeviceUpdateData, so we skip it for now
    // The device was already discovered, we just mark it as scanned
    try {
      await updateDevice(
        deviceId,
        {
          isScanned: true,
        },
        organizationId
      );
    } catch (error) {
      // Log but don't fail - device update is not critical
      ctx.logger.warn('Failed to update device isScanned flag', {
        scanId,
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    ctx.logger.info('Scan results stored successfully', {
      deviceId,
      scanId,
      scanRunId: scanRun.id,
      portsStored: openPorts.length,
    });

    // Build analytics with CVE count
    const analytics = buildSuccessAnalytics(
      AnalyticsEventTypes.PORTSCAN_SUCCESS,
      {
        scanId,
        entityId: deviceId,
        organizationId,
        resultCount: openPorts.length,
      }
    );

    // Add CVE count as additional metric (doubles[1])
    if (cveEnrichment) {
      analytics.doubles = [
        ...(analytics.doubles || []),
        cveEnrichment.summary.totalCves,
      ];
    }

    return {
      success: true,
      message: 'Port scan results stored successfully',
      analytics,
    };
  }

  /**
   * Handle failed port scan
   */
  private async handleFailure(
    params: {
      scanId: string;
      deviceId: string;
      organizationId: string;
      error: string;
    },
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, deviceId, organizationId, error } = params;

    ctx.logger.warn('Processing port scan failure', {
      scanId,
      deviceId,
      organizationId,
      error,
    });

    // Find scan run and mark it as failed (workflow data is now embedded)
    const scanRun = await getScanRunByRestateWorkflowId(organizationId, scanId);

    if (!scanRun) {
      ctx.logger.warn('Scan run not found for failure postback', {
        scanId,
        organizationId,
      });

      return {
        success: true, // We processed the postback successfully even though scan run wasn't found
        message: 'Scan run not found for failed scan',
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.PORTSCAN_DEVICE_NOT_FOUND,
          {
            scanId,
            entityId: deviceId,
            error: 'Scan run not found',
          }
        ),
      };
    }

    // Update workflow status to FAILED
    await updateScanWorkflowStatus(scanRun.id, 'FAILED');

    // Update scan run status with error details
    await updateScanRunStatus(scanRun.id, 'FAILED', { error });

    ctx.logger.info('Port scan failure processed', {
      scanId,
      deviceId,
      scanRunId: scanRun.id,
    });

    return {
      success: true,
      message: 'Port scan failure processed',
      analytics: buildFailureAnalytics(AnalyticsEventTypes.PORTSCAN_FAILURE, {
        scanId,
        entityId: deviceId,
        error,
      }),
    };
  }
}

/**
 * Singleton instance
 * Import this instance to use the handler
 */
export const portScanPostbackHandler = new PortScanPostbackHandler();
