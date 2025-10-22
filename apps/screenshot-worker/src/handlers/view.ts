/**
 * View Screenshot Handler
 *
 * Fetches screenshot from R2 and returns it as an image.
 * GET /view/:key
 */

import type { Env } from '../types/env';
import { createLogger } from '../utils/logger';

const logger = createLogger();

/**
 * Handle view screenshot request
 *
 * GET /view/:key
 * Returns: PNG image from R2
 */
export async function handleView(key: string, env: Env): Promise<Response> {
  try {
    logger.info('Fetching screenshot from R2', { key });

    // Fetch from R2
    const object = await env.SCREENSHOTS.get(key);

    if (!object) {
      logger.warn('Screenshot not found', { key });
      return new Response('Screenshot not found', { status: 404 });
    }

    // Return image with proper headers
    const headers = new Headers();
    headers.set('Content-Type', 'image/png');
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Add content-disposition to suggest filename
    const filename = key.split('/').pop() || 'screenshot.png';
    headers.set('Content-Disposition', `inline; filename="${filename}"`);

    logger.info('Screenshot served', { key, size: object.size });

    return new Response(object.body, { headers });
  } catch (error) {
    logger.error('Failed to fetch screenshot', { key, error });
    return new Response('Internal Server Error', { status: 500 });
  }
}
