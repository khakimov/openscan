/**
 * Scan Results Postback Handler
 *
 * Receives scan results from temporal-worker via HTTP postback.
 * Follows the Temporal activity-based side effects pattern.
 *
 * Architecture: See apps/temporal-worker/docs/database-free-portscan-architecture.md
 * Data Model: See docs/data-model.md
 */

import { createLogger } from '@repo/logger';
import { z } from 'zod';
import { getDeviceByIdGlobal, updateDevice } from '@repo/data-ops';

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
 * Updates device record with scan metadata
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

  // Update device with scan metadata
  await updateDevice(
    deviceId,
    {
      isScanned: true,
    },
    organizationId
  );

  // TODO (future): Store detailed scan results in scan_artifacts table
  // For now, device.isScanned and device.lastSeenAt track scan status
  // Full results can be retrieved via Temporal workflow result if needed

  logger.info('Scan results stored successfully', {
    deviceId,
    workflowId,
    portCount: results.ports?.length || 0,
  });
}

/**
 * Handle scan results postback from temporal-worker
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
