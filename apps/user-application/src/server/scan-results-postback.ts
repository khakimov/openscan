/**
 * Scan Results Postback Handler
 *
 * Receives scan results from restate-worker via HTTP postback.
 * Follows the Restate side effects pattern with HTTP callbacks.
 *
 * Architecture: See apps/restate-worker/CLAUDE.md
 * Data Model: See docs/data-model.md
 */

import { createLogger } from '@repo/logger';
import { z } from 'zod';
import {
  getDeviceByIdGlobal,
  updateDevice,
  getScanWorkflowByWorkflowId,
  updateScanRunStatus,
  updateScanWorkflowStatus,
  getDb,
  scanRuns,
  eq,
} from '@repo/data-ops';

const logger = createLogger({ name: 'scan-results-postback' });

/**
 * Validation schema for postback payload
 */
const PostbackPayloadSchema = z.object({
  deviceId: z.string().min(1, 'deviceId is required'),
  workflowId: z.string().min(1, 'workflowId is required'),
  results: z.object({
    target: z.string().optional(),
    ports: z.array(z.any()),
    osInfo: z.any().nullable().optional(),
    timing: z.object({
      start: z.number().optional(),
      end: z.number().optional(),
      elapsed: z.number().optional(),
    }).optional(),
    scanMetadata: z.object({
      scanner: z.string().optional(),
      version: z.string().optional(),
      arguments: z.string().optional(),
      duration: z.number().optional(),
      resolvedTarget: z.string().optional(),
    }).optional(),
  }),
});

/**
 * Authenticate request using WORKER_API_KEY
 */
function authenticateRequest(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedKey = process.env.WORKER_API_KEY;

  if (!expectedKey) {
    logger.error('WORKER_API_KEY not configured in environment');
    return false;
  }

  if (!authHeader) {
    logger.warn('Missing Authorization header in postback request');
    return false;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || token !== expectedKey) {
    logger.warn('Invalid API key in postback request');
    return false;
  }

  return true;
}

/**
 * Store scan results for a device
 * Updates device record with scan metadata and stores results in scan run
 */
async function storeScanResults(params: {
  deviceId: string;
  workflowId: string;
  results: any;
  organizationId: string;
}): Promise<void> {
  const { deviceId, workflowId, results, organizationId } = params;

  logger.info('Storing scan results', {
    deviceId,
    workflowId,
    organizationId,
    portCount: results.ports?.length || 0,
  });

  // Step 1: Find the scan workflow and run by workflow ID
  const workflow = await getScanWorkflowByWorkflowId(organizationId, workflowId);

  if (!workflow) {
    logger.warn('Scan workflow not found for postback', {
      workflowId,
      organizationId,
    });
    throw new Error(`Scan workflow not found: ${workflowId}`);
  }

  // Step 2: Get the scan run for this workflow
  // For port scans, there should be exactly one run per workflow
  const db = getDb();

  const [scanRun] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.workflowId, workflow.id))
    .limit(1);

  if (!scanRun) {
    logger.warn('No scan run found for workflow', {
      workflowId: workflow.id,
    });
    throw new Error(`No scan run found for workflow: ${workflow.id}`);
  }

  const portCount = results.ports?.length || 0;
  const timestamp = new Date().toISOString();

  // Step 3: Store results in scan run with port details
  await updateScanRunStatus(scanRun.id, 'SUCCEEDED', {
    target: results.target,
    openPortCount: portCount,
    ports: results.ports,
    timing: results.timing,
    scanMetadata: results.scanMetadata,
    osInfo: results.osInfo,
    completedAt: timestamp,
  });

  // Step 4: Update workflow status
  await updateScanWorkflowStatus(workflow.id, 'SUCCEEDED');

  // Step 5: Update device with scan metadata
  await updateDevice(
    deviceId,
    {
      isScanned: true,
      lastSeenAt: new Date(),
    },
    organizationId
  );

  logger.info('Scan results stored successfully', {
    deviceId,
    workflowId,
    scanRunId: scanRun.id,
    portCount,
  });
}

/**
 * Handle scan results postback from restate-worker
 * This is the main entry point called by the API route
 */
export async function handleScanResultsPostback(request: Request): Promise<Response> {
  try {
    // 1. Authenticate request
    if (!authenticateRequest(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate payload
    const body = await request.json();
    const parseResult = PostbackPayloadSchema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const path = firstError.path.join('.');
      logger.warn('Invalid postback payload', {
        error: firstError.message,
        path,
        body,
      });

      // Include field name in error message for clarity
      const errorMessage = path
        ? `Invalid payload: ${path} - ${firstError.message}`
        : `Invalid payload: ${firstError.message}`;

      return Response.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    const { deviceId, workflowId, results } = parseResult.data;

    logger.info('Received scan results postback', {
      deviceId,
      workflowId,
      portCount: results.ports.length,
    });

    // 3. Resolve device and organization
    // Note: We use global query because worker only knows deviceId
    // This is safe because:
    // - deviceId is globally unique (CUID)
    // - Request is authenticated with WORKER_API_KEY
    const device = await getDeviceByIdGlobal(deviceId);

    if (!device) {
      logger.warn('Device not found for postback', { deviceId, workflowId });
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    // 4. Store scan results
    await storeScanResults({
      deviceId,
      workflowId,
      results,
      organizationId: device.organizationId,
    });

    logger.info('Scan results postback completed successfully', {
      deviceId,
      workflowId,
      organizationId: device.organizationId,
    });

    return Response.json({ success: true });
  } catch (error) {
    logger.error('Failed to process scan results postback', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    });

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
