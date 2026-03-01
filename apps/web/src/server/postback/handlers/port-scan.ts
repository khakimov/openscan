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
import { safeParseCVEEnrichment } from '@repo/data-ops';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';
import { getRestateHttpClient } from '@/server/utils/restate-http-client';
import { getRestateUrl, getScanResultsCallbackUrl } from '@/lib/config';
import { PortScanPostbackSchema } from '@repo/contracts/postbacks';
import type { CVEEnrichment } from '@repo/data-ops';
import {
  buildPortScanStats,
  buildPortSnapshots,
  extractPortsForHttpx,
  getNectoAPIClient,
  normalizeServiceDetections,
} from './port-scan/utils';
export { resetNectoClientForTesting } from './port-scan/utils';

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

    // Step 2.5: Gatekeeper - filter low-confidence detections
    // Even if worker bypassed filtering, we ensure DB never gets junk
    const filteredPorts = normalizeServiceDetections(openPorts as any);
    if (filteredPorts.length < openPorts.length) {
      ctx.logger.info('Postback gatekeeper applied filtering', {
        scanId,
        before: openPorts.length,
        after: filteredPorts.length,
        discarded: openPorts.length - filteredPorts.length,
      });
    }
    openPorts = filteredPorts as any;

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

    const portSnapshots = buildPortSnapshots({
      ports: openPorts,
      timestamp,
      cveEnrichment,
    });

    const portScanStats = buildPortScanStats({
      totalOpenPorts: allOpenPorts.length,
      portsWithService: portsWithService.length,
      portsStored: portSnapshots.length,
      serviceDetectionRate,
      suspiciousAllPortsOpen,
    });

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
        const restateClient = getRestateHttpClient(getRestateUrl(ctx.env));

        const callbackUrl = getScanResultsCallbackUrl(ctx.env);

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
      const { createNotifications, getDeviceById } = await import('@repo/data-ops');

      // Check device verification status - only notify for VERIFIED devices
      const device = await getDeviceById(deviceId, organizationId);

      if (device?.verificationStatus !== 'VERIFIED') {
        ctx.logger.debug('[Notifications] Skipping change detection - device not verified', {
          scanId,
          deviceId,
          verificationStatus: device?.verificationStatus || 'unknown',
          note: 'Only VERIFIED (monitored) devices trigger notifications',
        });
      } else {
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
          deviceName: device.name || device.ip || undefined, // Pass device name for availability notifications
        });

        // Translate SERVICE_DRIFT changes into configuration drift notifications
        // This creates granular product/version change alerts without duplicating the generic SERVICE_DRIFT alert
        const { logAppProductChanged, logAppVersionChanged } = await import('@repo/data-ops');
        const deviceName = device.name || device.ip || 'unknown';

        for (const change of changes) {
          if (change.type === 'SERVICE_DRIFT' && change.data) {
            const data = change.data as { port?: number; protocol?: string; oldService?: any; newService?: any };

            if (!data.port || !data.oldService || !data.newService) continue;

            const payload = {
              organizationId,
              deviceId,
              deviceName,
              port: data.port,
            };

            // Check if product changed (more critical than version)
            const oldProduct = data.oldService.product ?? 'unknown';
            const newProduct = data.newService.product ?? 'unknown';
            const oldVersion = data.oldService.version ?? 'unknown';
            const newVersion = data.newService.version ?? 'unknown';

            if (oldProduct !== newProduct) {
              try {
                await logAppProductChanged({
                  ...payload,
                  oldProduct,
                  newProduct,
                });
                ctx.logger.info('[Configuration Drift] Product changed', {
                  deviceId,
                  port: data.port,
                  oldProduct,
                  newProduct,
                });
              } catch (error) {
                ctx.logger.error('[Configuration Drift] Failed to log product change', {
                  deviceId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            } else if (oldVersion !== newVersion) {
              try {
                await logAppVersionChanged({
                  ...payload,
                  product: newProduct,
                  oldVersion,
                  newVersion,
                });
                ctx.logger.info('[Configuration Drift] Version changed', {
                  deviceId,
                  port: data.port,
                  product: newProduct,
                  oldVersion,
                  newVersion,
                });
              } catch (error) {
                ctx.logger.error('[Configuration Drift] Failed to log version change', {
                  deviceId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        }

        // Remove SERVICE_DRIFT changes since we've emitted granular configuration drift alerts
        const filteredChanges = changes.filter(change => change.type !== 'SERVICE_DRIFT');

      if (filteredChanges.length > 0) {
        ctx.logger.info('[Notifications] Changes detected, creating notifications', {
          scanId,
          deviceId,
          changeCount: filteredChanges.length,
          changes: filteredChanges.map((c) => ({ type: c.type, severity: c.severity })),
        });

        // Calculate suppress window based on change type
        const now = Date.now();
        const notificationInputs = filteredChanges.map((change) => ({
          organizationId,
          deviceId,
          scanRunId: scanRun.id,
          type: change.type,
          severity: change.severity,
          module: change.module,
          title: change.title,
          message: change.message ?? null,
          data: change.data,
          fingerprint: change.fingerprint,
          // Suppress windows: 15min for availability, 6h for ports, 24h for CVEs
          suppressUntil: new Date(
            now +
              (change.type === 'SERVICE_DOWN' || change.type === 'SERVICE_UP'
                ? 15 * 60 * 1000 // 15 minutes (fast alerts for outages/recovery)
                : change.type.includes('PORT')
                ? 6 * 60 * 60 * 1000 // 6 hours
                : 24 * 60 * 60 * 1000) // 24 hours
          ),
        }));

        const createdNotifications = await createNotifications(notificationInputs);

        ctx.logger.info('[Notifications] Notifications created', {
          scanId,
          deviceId,
          requested: filteredChanges.length,
          created: createdNotifications.length,
          suppressed: filteredChanges.length - createdNotifications.length,
        });

        // Enqueue delivery jobs for created notifications
        if (createdNotifications.length > 0 && ctx.env?.NOTIFICATION_DELIVERY_PRODUCER) {
          try {
            const { enqueueNotificationDelivery } = await import('@/server/notifications/delivery-queue');
            const env = ctx.env as Env;
            // Pass scanRunId to enable batching multiple notifications into one email
            await enqueueNotificationDelivery(createdNotifications, env, { scanRunId: scanId });
            ctx.logger.info('[Notifications] Delivery jobs enqueued', {
              scanId,
              deviceId,
              count: createdNotifications.length,
              batched: createdNotifications.length > 1,
            });
          } catch (error) {
            ctx.logger.error('[Notifications] Failed to enqueue delivery jobs', {
              scanId,
              deviceId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else if (createdNotifications.length > 0) {
          ctx.logger.warn('[Notifications] Skipping delivery enqueue - queue binding missing', {
            scanId,
            deviceId,
          });
        }
      } else {
        ctx.logger.debug('[Notifications] No changes detected', {
          scanId,
          deviceId,
        });
        }
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
