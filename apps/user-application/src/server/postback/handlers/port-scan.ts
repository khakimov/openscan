/**
 * Port Scan Postback Handler
 *
 * Handles postback callbacks from restate-worker for port scan workflows.
 * Stores scan results in the database and updates workflow status.
 */

import { z } from 'zod';
import {
  updateDevice,
  getScanWorkflowByScanId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
  getDb,
  scanRuns,
  eq,
} from '@repo/data-ops';
import type { PostbackHandler, HandlerContext, HandlerResult } from './base';
import type { PortScanPostback } from '../types';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';

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

    // Step 1: Find the scan workflow by scanId (Restate workflow key)
    const workflow = await getScanWorkflowByScanId(organizationId, scanId);

    if (!workflow) {
      ctx.logger.warn('Scan workflow not found for postback', {
        scanId,
        organizationId,
      });

      return {
        success: false,
        message: `Scan workflow not found: ${scanId}`,
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.PORTSCAN_DEVICE_NOT_FOUND,
          {
            scanId,
            entityId: deviceId,
            error: 'Workflow not found',
          }
        ),
      };
    }

    // Step 2: Get the scan run for this workflow
    // For port scans, there should be exactly one run per workflow
    const db = getDb();

    const [scanRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.scanWorkflowId, workflow.id))
      .limit(1);

    if (!scanRun) {
      ctx.logger.warn('No scan run found for workflow', {
        scanWorkflowId: workflow.id,
      });

      return {
        success: false,
        message: `No scan run found for workflow: ${workflow.id}`,
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.PORTSCAN_FAILURE,
          {
            scanId,
            entityId: deviceId,
            error: 'Scan run not found',
          }
        ),
      };
    }

    const portCount = data.ports?.length || 0;
    const timestamp = new Date().toISOString();

    // Step 3: Store results in scan run with port details
    const resultSummary = {
      target: data.target,
      openPortCount: portCount,
      ports: data.ports,
      timing: data.timing,
      scanMetadata: data.scanMetadata,
      osInfo: data.osInfo,
      completedAt: timestamp,
    };

    ctx.logger.info('Storing result summary', {
      scanRunId: scanRun.id,
      resultSummaryKeys: Object.keys(resultSummary),
      portCount,
      portsLength: data.ports?.length,
    });

    await updateScanRunStatus(scanRun.id, 'SUCCEEDED', resultSummary);

    // Step 4: Update workflow status
    ctx.logger.info('Updating workflow status to SUCCEEDED', {
      scanWorkflowId: workflow.id, // Database ID (CUID)
      scanId: workflow.scanId, // Restate workflow key
      organizationId,
    });
    await updateScanWorkflowStatus(workflow.id, 'SUCCEEDED');

    // Step 5: Update device with scan metadata
    // Note: lastSeenAt is not in DeviceUpdateData, so we skip it for now
    // The device was already discovered, we just mark it as scanned
    await updateDevice(
      deviceId,
      {
        isScanned: true,
      },
      organizationId
    );

    ctx.logger.info('Scan results stored successfully', {
      deviceId,
      scanId,
      scanRunId: scanRun.id,
      portCount,
    });

    return {
      success: true,
      message: 'Port scan results stored successfully',
      analytics: buildSuccessAnalytics(AnalyticsEventTypes.PORTSCAN_SUCCESS, {
        scanId,
        entityId: deviceId,
        organizationId,
        resultCount: portCount,
      }),
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

    // Find workflow and mark it as failed
    const workflow = await getScanWorkflowByScanId(organizationId, scanId);

    if (!workflow) {
      ctx.logger.warn('Scan workflow not found for failure postback', {
        scanId,
        organizationId,
      });

      return {
        success: true, // We processed the postback successfully even though workflow wasn't found
        message: 'Workflow not found for failed scan',
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.PORTSCAN_DEVICE_NOT_FOUND,
          {
            scanId,
            entityId: deviceId,
            error: 'Workflow not found',
          }
        ),
      };
    }

    // Update workflow status to FAILED
    await updateScanWorkflowStatus(workflow.id, 'FAILED');

    // Update scan run status if it exists
    const db = getDb();
    const [scanRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.scanWorkflowId, workflow.id))
      .limit(1);

    if (scanRun) {
      await updateScanRunStatus(scanRun.id, 'FAILED', { error });
    }

    ctx.logger.info('Port scan failure processed', {
      scanId,
      deviceId,
      scanWorkflowId: workflow.id,
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
