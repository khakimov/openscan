/**
 * Port Scan Postback Handler
 *
 * Handles postback callbacks from restate-worker for port scan workflows.
 * Stores scan results in the database and updates workflow status.
 */

import {
  updateDevice,
  getScanRunByRestateWorkflowId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
} from '@repo/data-ops';
import type { PostbackHandler, HandlerContext, HandlerResult } from './base';
import type { PortScanPostback } from '../types';
import type { CVEEnrichment, PortSnapshot } from '@repo/data-ops';
import { safeParseCVEEnrichment, buildPortEnrichmentMap } from '@repo/data-ops';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';
import {
  createNectoAPIClient,
  type NectoAPIClient,
} from '@/server/discovery/services/necto-api-client';
import { getRestateHttpClient } from '@/server/utils/restate-http-client';
import { PortScanPostbackSchema } from '@repo/contracts/postbacks';

/**
 * Necto API client singleton
 * Reused across postback requests for efficiency
 */
let nectoClientInstance: NectoAPIClient | null = null;

function getNectoAPIClient(nectoApiUrl?: string, apiKey?: string): NectoAPIClient {
  if (!nectoClientInstance) {
    const baseUrl = nectoApiUrl || process.env.NECTO_API_URL || 'http://127.0.0.1:5020';

    nectoClientInstance = createNectoAPIClient({
      baseUrl,
      apiKey: apiKey || process.env.WORKER_API_KEY,
      timeout: 30000,
      retries: 2,
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
 * Extract all open ports with service detection for httpx probing
 *
 * Strategy: Probe ALL open ports that have service information
 * Rationale:
 * - Service detection is often inaccurate (e.g., port 9100 shows as "jetdirect" but is actually HTTP)
 * - httpx fails fast on non-HTTP ports (timeout in seconds)
 * - Only probe ports with services to avoid WAF scenarios (all ports open, no actual services)
 * - Industry standard approach used by httpx, nuclei, aquatone, EyeWitness
 * - Ensures we don't miss HTTP services on non-standard ports
 */
function extractPortsForHttpx(ports: Array<{ port: number; state: string; service?: any }>): number[] {
  return ports
    .filter((p) => p.state === 'open' && (p.service?.name || p.service?.product))
    .map((p) => p.port)
    .sort((a, b) => a - b);
}

/**
 * Port Scan Postback Handler
 *
 * Processes postback callbacks from port scan workflows.
 * Handles both successful and failed scans.
 */
export class PortScanPostbackHandler
  implements PostbackHandler<PortScanPostback, typeof PortScanPostbackSchema>
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
        const nectoClient = getNectoAPIClient(ctx.env?.NECTO_API_URL, ctx.env?.WORKER_API_KEY);
        const rawEnrichment = await nectoClient.enrichScanResults(
          openPorts,
          data.osInfo
        );

        // ✅ Schema-first pattern: Validate CVE enrichment data
        const validationResult = safeParseCVEEnrichment(rawEnrichment);

        if (!validationResult.success) {
          ctx.logger.error('CVE enrichment validation failed', {
            scanId,
            error: validationResult.error.message,
            issues: validationResult.error.issues,
          });
          // cveEnrichment remains undefined - don't save invalid data
        } else {
          cveEnrichment = validationResult.data;

          ctx.logger.info('CVE enrichment completed', {
            scanId,
            totalCves: cveEnrichment.summary.totalCves,
            criticalCount: cveEnrichment.summary.totalCritical,
            highCount: cveEnrichment.summary.totalHigh,
          });
        }
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

    // Step 4: Build unified port snapshots (sec-zg2)
    // Create protocol map for enrichment helper
    const portProtocolMap = new Map<number, 'tcp' | 'udp'>();
    for (const port of openPorts) {
      portProtocolMap.set(port.port, port.protocol);
    }

    // Get per-port CVE enrichment summaries
    const enrichmentMap = buildPortEnrichmentMap(cveEnrichment, portProtocolMap);

    // Transform ports into unified PortSnapshot structure
    const portSnapshots: PortSnapshot[] = openPorts.map((port) => {
      const key = `${port.protocol}/${port.port}`;
      return {
        port: port.port,
        protocol: port.protocol,
        state: port.state,
        service: port.service ? {
          name: port.service.name,
          product: port.service.product ?? null,
          version: port.service.version ?? null,
          cpe: null, // TODO(sec-8sh): Extract from CVE enrichment CPE strings
          method: port.service.method,
          confidence: port.service.confidence,
        } : null,
        metadata: {
          lastSeenAt: timestamp, // Handler always sets lastSeenAt
          // firstSeenAt and lastChangedAt will be set by change detector (sec-8sh)
        },
        enrichment: enrichmentMap.get(key), // Per-port CVE summary
      };
    });

    // ✅ Build port scan stats (pre-filtering metrics that can't be derived post-hoc)
    const portScanStats = {
      totalOpenPorts: allOpenPorts.length,
      portsWithService: portsWithService.length,
      portsStored: portSnapshots.length,
      serviceDetectionRate,
      suspiciousAllPortsOpen,
      scanPattern: suspiciousAllPortsOpen ? 'Possible WAF/Proxy' : 'Normal',
    };

    // Store results with new unified structure (sec-zg2)
    const resultSummary = {
      target: data.target,
      portSnapshots, // ✅ Single authoritative structure
      portScanStats, // ✅ Pre-filtering metrics (can't be derived later)
      timing: data.timing,
      scanMetadata: data.scanMetadata,
      osInfo: data.osInfo,
      completedAt: timestamp,
      cveEnrichment, // ✅ Keep canonical CVE data at top level
    };

    // Validate result summary size before storing
    const resultSummaryJson = JSON.stringify(resultSummary);
    const resultSizeMB = resultSummaryJson.length / 1024 / 1024;

    ctx.logger.info('Storing result summary', {
      scanRunId: scanRun.id,
      portSnapshotsStored: portSnapshots.length,
      resultSizeMB: resultSizeMB.toFixed(2),
    });

    // Warn if result summary is approaching size limits (D1 has practical limits)
    if (resultSizeMB > 0.5) {
      ctx.logger.warn('Large result summary detected', {
        scanId,
        resultSizeMB: resultSizeMB.toFixed(2),
        portSnapshotsStored: portSnapshots.length,
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

    // Step 7: Trigger httpx workflow for all open ports with service detection
    const portsForHttpx = extractPortsForHttpx(data.ports || []);

    if (portsForHttpx.length > 0) {
      ctx.logger.info('Open ports with services detected, triggering httpx probe', {
        scanId,
        deviceId,
        target: data.target,
        ports: portsForHttpx,
        portCount: portsForHttpx.length,
      });

      try {
        // Use Restate HTTP client for consistent invocation
        const restateClient = getRestateHttpClient(
          ctx.env?.RESTATE_INGRESS_URL || process.env.RESTATE_INGRESS_URL
        );

        const callbackUrl = `${ctx.env?.APP_URL || process.env.APP_URL || 'https://sec-rocks.saipe.workers.dev'}/api/internal/scan-results`;

        await restateClient.startHttpxProbe({
          target: data.target,
          ports: portsForHttpx,
          scanRunId: scanRun.id,
          deviceId,
          organizationId,
          callbackUrl,
          screenshotsEnabled: true,
          timeout: 10,
        });

        ctx.logger.info('Httpx probe triggered successfully', {
          scanRunId: scanRun.id,
          portsQueued: portsForHttpx.length,
        });
      } catch (error) {
        // Non-critical - log but don't fail port scan postback
        ctx.logger.error('Failed to trigger httpx workflow', {
          scanId,
          deviceId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    ctx.logger.info('Scan results stored successfully', {
      deviceId,
      scanId,
      scanRunId: scanRun.id,
      portSnapshotsStored: portSnapshots.length,
      httpxPortsQueued: portsForHttpx.length,
    });

    // Step 8: Change Detection & Notification Creation
    try {
      const { detectScanChanges } = await import('@/server/notifications/change-detector');
      const { createNotifications } = await import('@repo/data-ops');

      // CRITICAL: Pass fresh scan data with updated resultSummary
      // The scanRun fetched at line 220 has stale/null resultSummary
      const freshScanData = {
        ...scanRun,
        resultSummary, // Use the freshly built resultSummary from line 345
      };

      const changes = await detectScanChanges({
        deviceId,
        currentScan: freshScanData,
        organizationId,
      });

      if (changes.length > 0) {
        ctx.logger.info('[Notifications] Changes detected, creating notifications', {
          scanId,
          deviceId,
          changeCount: changes.length,
          changes: changes.map((c) => ({ type: c.type, severity: c.severity })),
        });

        // Calculate suppress window based on change type
        const now = Date.now();
        const notificationInputs = changes.map((change) => ({
          organizationId,
          deviceId,
          scanRunId: scanRun.id,
          type: change.type,
          severity: change.severity,
          module: change.module,
          title: change.title,
          message: change.message || undefined,
          data: change.data,
          fingerprint: change.fingerprint,
          // Suppress windows: 6h for ports, 24h for CVEs
          suppressUntil: new Date(
            now +
              (change.type.includes('PORT')
                ? 6 * 60 * 60 * 1000 // 6 hours
                : 24 * 60 * 60 * 1000) // 24 hours
          ),
        }));

        const createdNotifications = await createNotifications(notificationInputs);

        ctx.logger.info('[Notifications] Notifications created', {
          scanId,
          deviceId,
          requested: changes.length,
          created: createdNotifications.length,
          suppressed: changes.length - createdNotifications.length,
        });
      } else {
        ctx.logger.debug('[Notifications] No changes detected', {
          scanId,
          deviceId,
        });
      }
    } catch (error) {
      // Don't fail postback if notification creation fails
      ctx.logger.error('[Notifications] Failed to create notifications', {
        scanId,
        deviceId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
    }

    // Build analytics with CVE count
    const analytics = buildSuccessAnalytics(
      AnalyticsEventTypes.PORTSCAN_SUCCESS,
      {
        scanId,
        entityId: deviceId,
        organizationId,
        resultCount: portSnapshots.length,
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
