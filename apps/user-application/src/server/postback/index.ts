/**
 * Universal Postback Router
 *
 * Single entry point for all postback types from restate-worker.
 * Routes requests to appropriate handlers based on payload type.
 *
 * Architecture:
 * - Type discrimination via 'type' field in payload
 * - Handler registry for extensibility
 * - Unified authentication and analytics
 * - Type-safe validation per handler
 *
 * Adding a new postback type:
 * 1. Define type in types.ts (extend BasePostback)
 * 2. Create handler in handlers/ (implement PostbackHandler<T>)
 * 3. Register handler in handlers/registry.ts
 *
 * Example:
 * POST /api/internal/postback
 * {
 *   "type": "PORT_SCAN",
 *   "scanId": "portscan-0-0-0-0-123",
 *   "organizationId": "org_123",
 *   "status": "SUCCESS",
 *   "data": { ... }
 * }
 */

import { createLogger } from '@repo/logger';
import { z } from 'zod';
import { authenticateRequest } from './auth';
import {
  trackPostbackAnalytics,
  AnalyticsEventTypes,
} from './analytics';
import { postbackRegistry } from './handlers/registry';

const logger = createLogger({ name: 'postback-router' });

/**
 * Base schema for initial request parsing
 *
 * This validates just enough to route the request to the correct handler.
 * Full validation happens in the handler's schema.
 */
const BasePostbackRequestSchema = z.object({
  type: z.string(),
  scanId: z.string().optional(),
}).passthrough(); // Allow additional fields for handler validation

/**
 * Universal Postback Handler
 *
 * Main entry point for all postback requests.
 * Routes to appropriate handler based on payload type.
 *
 * @param request - HTTP request from restate-worker
 * @param env - Environment bindings (Analytics Engine, etc.)
 * @returns HTTP response with success/error status
 */
export async function handleUniversalPostback(
  request: Request,
  env?: { ANALYTICS?: AnalyticsEngineDataset }
): Promise<Response> {
  const startTime = Date.now();
  let postbackType = 'unknown';
  let scanId = 'unknown';

  logger.info('Universal postback request received', {
    method: request.method,
    url: request.url,
    hasBody: request.body !== null,
  });

  try {
    // Step 1: Authenticate request
    if (!authenticateRequest(request)) {
      logger.error('Postback authentication failed - returning 401');

      // Track authentication failure
      trackPostbackAnalytics(
        env,
        AnalyticsEventTypes.AUTH_FAILED,
        startTime,
        {
          blobs: ['unknown', 'unknown', 'Authentication failed'],
        }
      );

      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Parse and validate base request structure
    const rawBody = await request.json();
    const baseParseResult = BasePostbackRequestSchema.safeParse(rawBody);

    if (!baseParseResult.success) {
      const firstError = baseParseResult.error.issues[0];
      const errorMessage = `Invalid request: ${firstError.path.join('.')} - ${firstError.message}`;

      logger.warn('Base request validation failed', {
        error: firstError.message,
        path: firstError.path.join('.'),
        body: rawBody,
      });

      trackPostbackAnalytics(
        env,
        AnalyticsEventTypes.VALIDATION_FAILED,
        startTime,
        {
          blobs: ['unknown', 'unknown', errorMessage],
        }
      );

      return Response.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    // Now we have type-safe access to body
    const body = baseParseResult.data;
    postbackType = body.type;
    scanId = body.scanId || 'unknown';

    logger.info('Postback payload received', {
      bodyKeys: Object.keys(body),
      type: body.type,
      scanId,
    });

    // Step 4: Look up handler in registry
    const handler = postbackRegistry.get(postbackType);

    if (!handler) {
      const availableTypes = postbackRegistry.getAllTypes();
      logger.warn('No handler registered for postback type', {
        type: postbackType,
        availableTypes,
      });

      trackPostbackAnalytics(
        env,
        AnalyticsEventTypes.VALIDATION_FAILED,
        startTime,
        {
          blobs: [
            scanId,
            'unknown',
            `Unsupported postback type: ${postbackType}`,
          ],
        }
      );

      return Response.json(
        {
          error: `Unsupported postback type: ${postbackType}`,
          availableTypes,
        },
        { status: 400 }
      );
    }

    logger.info('Handler found for postback type', {
      type: postbackType,
      handlerType: handler.type,
    });

    // Step 5: Validate payload with handler's schema
    const parseResult = handler.schema.safeParse(body);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const path = firstError.path.join('.');
      const errorMessage = path
        ? `Invalid payload: ${path} - ${firstError.message}`
        : `Invalid payload: ${firstError.message}`;

      logger.warn('Postback payload validation failed', {
        type: postbackType,
        error: firstError.message,
        path,
        body,
      });

      trackPostbackAnalytics(
        env,
        AnalyticsEventTypes.VALIDATION_FAILED,
        startTime,
        {
          blobs: [scanId, 'unknown', errorMessage],
        }
      );

      return Response.json({ error: errorMessage }, { status: 400 });
    }

    logger.info('Postback payload validated successfully', {
      type: postbackType,
      scanId,
    });

    // Step 6: Execute handler
    const result = await handler.handle(parseResult.data, {
      env,
      logger,
      startTime,
    });

    logger.info('Postback handler completed', {
      type: postbackType,
      scanId,
      success: result.success,
      message: result.message,
    });

    // Step 7: Track analytics
    if (result.analytics) {
      // Handler provided custom analytics
      trackPostbackAnalytics(
        env,
        result.analytics.eventType,
        startTime,
        {
          blobs: result.analytics.blobs,
          doubles: result.analytics.doubles,
        }
      );
    } else {
      // Default analytics based on success/failure
      const eventType = result.success
        ? `postback_${postbackType.toLowerCase()}_success`
        : `postback_${postbackType.toLowerCase()}_failure`;

      trackPostbackAnalytics(env, eventType, startTime, {
        blobs: [scanId, 'unknown', result.message || ''],
      });
    }

    // Step 8: Return response
    if (result.success) {
      return Response.json({
        success: true,
        message: result.message || 'Postback processed successfully',
      });
    } else {
      return Response.json(
        {
          success: false,
          error: result.message || 'Postback processing failed',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error('Unhandled error in postback router', {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
      type: postbackType,
      scanId,
    });

    // Track generic failure
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    trackPostbackAnalytics(env, AnalyticsEventTypes.GENERIC_FAILURE, startTime, {
      blobs: [scanId, 'unknown', errorMessage],
    });

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
