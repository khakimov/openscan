/**
 * Discovery Postback Handler
 *
 * Handles postback callbacks from restate-worker for discovery workflows.
 * Stores discovery results in the database for user review and manual device creation.
 */

import { z } from 'zod';
import {
  getScanWorkflowByScanId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
  getDb,
  scanRuns,
  eq,
} from '@repo/data-ops';
import type { PostbackHandler, HandlerContext, HandlerResult } from './base';
import type { DiscoveryPostback } from '../types';
import {
  AnalyticsEventTypes,
  buildSuccessAnalytics,
  buildFailureAnalytics,
} from '../analytics';

/**
 * Zod schema for discovery postback validation
 */
const DiscoveryPostbackSchema = z.object({
  type: z.literal('DISCOVERY'),
  scanId: z.string().min(1, 'scanId is required'),
  organizationId: z.string().min(1, 'organizationId is required'),
  timestamp: z.string(),
  status: z.enum(['SUCCESS', 'FAILURE']),
  data: z.object({
    target: z.string(),
    devices: z.array(
      z.object({
        hostname: z.string(),
        ipAddress: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    ),
    totalSubdomains: z.number(),
    executionTime: z.number(),
    tools: z.array(z.string()),
    errors: z.array(z.string()).optional(),
  }),
  error: z.string().optional(),
});

/**
 * Discovery Postback Handler
 *
 * Processes postback callbacks from discovery workflows.
 * Handles both successful and failed discovery scans.
 */
export class DiscoveryPostbackHandler
  implements PostbackHandler<DiscoveryPostback>
{
  readonly type = 'DISCOVERY';
  readonly schema = DiscoveryPostbackSchema;

  async handle(
    payload: DiscoveryPostback,
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, organizationId, data, status, error } = payload;

    ctx.logger.info('Processing discovery postback', {
      scanId,
      organizationId,
      status,
      deviceCount: data?.devices?.length || 0,
      totalSubdomains: data?.totalSubdomains,
    });

    try {
      // Handle failure case
      if (status === 'FAILURE') {
        return await this.handleFailure(
          { scanId, organizationId, error: error || 'Unknown error' },
          ctx
        );
      }

      // Handle success case
      return await this.handleSuccess(
        { scanId, organizationId, data },
        ctx
      );
    } catch (error) {
      ctx.logger.error('Failed to process discovery postback', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
        scanId,
      });

      return {
        success: false,
        message: 'Failed to process discovery postback',
        analytics: buildFailureAnalytics(AnalyticsEventTypes.DISCOVERY_FAILURE, {
          scanId,
          entityId: organizationId, // For discovery, we use organizationId as entityId
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }
  }

  /**
   * Handle successful discovery
   */
  private async handleSuccess(
    params: {
      scanId: string;
      organizationId: string;
      data: DiscoveryPostback['data'];
    },
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, organizationId, data } = params;

    ctx.logger.info('Processing discovery results', {
      scanId,
      organizationId,
      deviceCount: data.devices.length,
      totalSubdomains: data.totalSubdomains,
      target: data.target,
    });

    // Step 1: Find the scan workflow by scanId
    const workflow = await getScanWorkflowByScanId(organizationId, scanId);

    if (!workflow) {
      ctx.logger.warn('Discovery workflow not found for postback', {
        scanId,
        organizationId,
      });

      return {
        success: false,
        message: `Discovery workflow not found: ${scanId}`,
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.DISCOVERY_FAILURE,
          {
            scanId,
            entityId: organizationId,
            error: 'Workflow not found',
          }
        ),
      };
    }

    // Step 2: Get the scan run for this workflow
    const db = getDb();

    const [scanRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.scanWorkflowId, workflow.id))
      .limit(1);

    if (!scanRun) {
      ctx.logger.warn('No scan run found for discovery workflow', {
        scanWorkflowId: workflow.id,
      });

      return {
        success: false,
        message: `No scan run found for workflow: ${workflow.id}`,
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.DISCOVERY_FAILURE,
          {
            scanId,
            entityId: organizationId,
            error: 'Scan run not found',
          }
        ),
      };
    }

    // Step 3: Store discovery results for user review
    // Devices will be created when user manually selects them in the UI
    ctx.logger.info('Storing discovery results for user review', {
      deviceCount: data.devices.length,
      target: data.target,
    });

    // Step 4: Store results in scan run with full device data for UI
    const resultSummary = {
      target: data.target,
      totalSubdomains: data.totalSubdomains,
      discoveredDevices: data.devices.length,
      devices: data.devices, // Store full device list for UI to display
      executionTime: data.executionTime,
      tools: data.tools,
      errors: data.errors,
      completedAt: new Date().toISOString(),
    };

    ctx.logger.info('Storing discovery result summary', {
      scanRunId: scanRun.id,
      resultSummary,
    });

    await updateScanRunStatus(scanRun.id, 'SUCCEEDED', resultSummary);

    // Step 5: Update workflow status
    ctx.logger.info('Updating workflow status to SUCCEEDED', {
      scanWorkflowId: workflow.id,
      scanId: workflow.scanId,
      organizationId,
    });
    await updateScanWorkflowStatus(workflow.id, 'SUCCEEDED');

    ctx.logger.info('Discovery results stored successfully', {
      scanId,
      scanRunId: scanRun.id,
      devicesDiscovered: data.devices.length,
    });

    return {
      success: true,
      message: 'Discovery results stored successfully',
      analytics: buildSuccessAnalytics(AnalyticsEventTypes.DISCOVERY_SUCCESS, {
        scanId,
        entityId: organizationId,
        organizationId,
        resultCount: data.devices.length,
      }),
    };
  }

  /**
   * Handle failed discovery
   */
  private async handleFailure(
    params: {
      scanId: string;
      organizationId: string;
      error: string;
    },
    ctx: HandlerContext
  ): Promise<HandlerResult> {
    const { scanId, organizationId, error } = params;

    ctx.logger.warn('Processing discovery failure', {
      scanId,
      organizationId,
      error,
    });

    // Find workflow and mark it as failed
    const workflow = await getScanWorkflowByScanId(organizationId, scanId);

    if (!workflow) {
      ctx.logger.warn('Discovery workflow not found for failure postback', {
        scanId,
        organizationId,
      });

      return {
        success: true, // We processed the postback successfully even though workflow wasn't found
        message: 'Workflow not found for failed discovery',
        analytics: buildFailureAnalytics(
          AnalyticsEventTypes.DISCOVERY_FAILURE,
          {
            scanId,
            entityId: organizationId,
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

    ctx.logger.info('Discovery failure processed', {
      scanId,
      scanWorkflowId: workflow.id,
    });

    return {
      success: true,
      message: 'Discovery failure processed',
      analytics: buildFailureAnalytics(AnalyticsEventTypes.DISCOVERY_FAILURE, {
        scanId,
        entityId: organizationId,
        error,
      }),
    };
  }
}

/**
 * Singleton instance
 * Import this instance to use the handler
 */
export const discoveryPostbackHandler = new DiscoveryPostbackHandler();
