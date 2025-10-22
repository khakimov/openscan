/**
 * Screenshot Worker - Main Entry Point
 *
 * Cloudflare Worker that captures screenshots of web services using Browser Rendering API.
 *
 * Endpoints:
 * - POST /screenshots/capture - Capture screenshots for HTTP ports
 * - GET /health - Health check
 *
 * Architecture:
 * - Stateless HTTP worker (no database access)
 * - Triggered by queue consumer in user-application
 * - Posts results back to user-application via postback
 * - Single responsibility: capture + store screenshots
 */

import type { Env } from './types/env';
import { handleCapture } from './handlers/capture';
import { handleHealth } from './handlers/health';
import { handleTest } from './handlers/test';
import { handleView } from './handlers/view';
import { handleError } from './utils/errors';
import { createLogger } from './utils/logger';

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = createLogger(env);
    const url = new URL(request.url);

    logger.debug('Request received', {
      method: request.method,
      path: url.pathname,
    });

    try {
      // Route requests
      if (url.pathname === '/health' && request.method === 'GET') {
        return await handleHealth(env);
      }

      if (url.pathname === '/screenshots/capture' && request.method === 'POST') {
        return await handleCapture(request, env);
      }

      if (url.pathname === '/screenshots/test' && request.method === 'POST') {
        return await handleTest(request, env);
      }

      // GET /view/:key - View screenshot
      if (url.pathname.startsWith('/view/') && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.substring(6)); // Remove '/view/'
        return await handleView(key, env);
      }

      // 404 Not Found
      return Response.json(
        {
          error: 'NotFound',
          message: 'Endpoint not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    } catch (error) {
      logger.error('Unhandled error', { error });
      return handleError(error);
    }
  },
};
