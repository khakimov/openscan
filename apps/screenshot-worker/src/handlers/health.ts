/**
 * Health Check Handler
 *
 * GET /health
 *
 * Returns health status of the worker and its bindings.
 * Used for monitoring and uptime checks.
 */

import type { Env } from '../types/env';
import type { HealthResponse } from '../types';
import { checkR2Health } from '../services/storage';
import { createLogger } from '../utils/logger';

/**
 * Handle health check request
 *
 * GET /health
 */
export async function handleHealth(env: Env): Promise<Response> {
  try {
    // Check bindings
    const browserAvailable = !!env.BROWSER;
    const r2Available = await checkR2Health(env.SCREENSHOTS);

    // Log binding details for debugging
    const logger = createLogger();
    logger.info('Health check', {
      browserType: typeof env.BROWSER,
      browserAvailable,
      r2Available,
    });

    const allHealthy = browserAvailable && r2Available;

    const response: HealthResponse = {
      status: allHealthy ? 'ok' : 'degraded',
      version: env.VERSION,
      environment: env.ENVIRONMENT,
      bindings: {
        browser: browserAvailable,
        r2: r2Available,
      },
      timestamp: new Date().toISOString(),
    };

    const statusCode = allHealthy ? 200 : 503;
    return Response.json(response, { status: statusCode });
  } catch (error) {
    // Health check itself failed
    const response: HealthResponse = {
      status: 'degraded',
      version: env.VERSION,
      environment: env.ENVIRONMENT,
      bindings: {
        browser: false,
        r2: false,
      },
      timestamp: new Date().toISOString(),
    };

    return Response.json(response, { status: 503 });
  }
}
