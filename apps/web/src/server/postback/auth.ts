/**
 * Postback Authentication
 *
 * Shared authentication logic for all postback handlers.
 * Validates that the request comes from a trusted restate-worker using WORKER_API_KEY.
 */

import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'postback-auth' });

/**
 * Authenticate postback request using WORKER_API_KEY
 *
 * Checks that:
 * 1. WORKER_API_KEY environment variable is configured
 * 2. Request has Authorization header
 * 3. Header format is "Bearer <token>"
 * 4. Token matches WORKER_API_KEY
 *
 * @param request - Incoming HTTP request from restate-worker
 * @returns true if authentication succeeds, false otherwise
 *
 * @example
 * if (!authenticateRequest(request)) {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 */
export function authenticateRequest(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedKey = process.env.WORKER_API_KEY;

  logger.info('Authenticating postback request', {
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 10) + '...',
    hasExpectedKey: !!expectedKey,
    expectedKeyPrefix: expectedKey?.substring(0, 10) + '...',
  });

  // Check environment variable is configured
  if (!expectedKey) {
    logger.error('WORKER_API_KEY not configured in environment');
    return false;
  }

  // Check Authorization header exists
  if (!authHeader) {
    logger.warn('Missing Authorization header in postback request');
    return false;
  }

  // Parse header (format: "Bearer <token>")
  const [scheme, token] = authHeader.split(' ');

  logger.info('Auth header parsed', {
    scheme,
    tokenPrefix: token?.substring(0, 10) + '...',
    expectedKeyPrefix: expectedKey?.substring(0, 10) + '...',
    tokensMatch: token === expectedKey,
  });

  // Validate scheme and token
  if (scheme !== 'Bearer' || token !== expectedKey) {
    logger.warn('Invalid API key in postback request', {
      scheme,
      isBearer: scheme === 'Bearer',
      tokenMatch: token === expectedKey,
    });
    return false;
  }

  logger.info('Postback authentication successful');
  return true;
}
