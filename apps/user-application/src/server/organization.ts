/**
 * Organization server functions for SSR
 *
 * Uses createServerFn to access Worker bindings (env.DB) during SSR
 * Leverages existing data-ops queries for consistency
 */

import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { initDatabase } from '@repo/data-ops/database/setup';
import { getOrganizationBySlugOrId } from '@repo/data-ops';
import { getAuth } from '@repo/data-ops/auth/server';
import { getOrganizationAPI } from '@repo/data-ops/auth/organization-api';
import { createLogger } from '@repo/logger';
import { env } from 'cloudflare:workers';

const logger = createLogger({ name: 'organization-server' });

/**
 * Get Workers env
 */
function getEnv(): Env {
  initDatabase(env.DB);
  return env;
}

/**
 * Get organization by ID or slug (SSR-safe)
 *
 * Uses data-ops query with direct DB access via Worker binding - no HTTP calls
 */
export const getOrganization = createServerFn({ method: 'GET' })
  .inputValidator((organizationId: string) => organizationId)
  .handler(async ({ data: organizationId }) => {
    getEnv();

    const org = await getOrganizationBySlugOrId(organizationId);

    if (!org) {
      throw new Error('Organization not found');
    }

    logger.info('[getOrganization serverFn]', {
      identifier: organizationId,
      foundId: org.id,
      slug: org.slug,
      isSSR: typeof window === 'undefined'
    });

    return org;
  });

/**
 * List all organizations for the current user (SSR-safe)
 *
 * During SSR: Executes directly in worker (has access to getRequest())
 * During client nav: Makes HTTP to /_serverFn/... endpoint
 */
export const listOrganizations = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const env = getEnv();
    const request = getRequest();
    const auth = getAuth(env);

    // Check for valid session before calling org API
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      logger.debug('No authenticated session for listOrganizations');
      return [];
    }

    const orgAPI = getOrganizationAPI(auth);

    // Better-auth organization API uses request context for session
    const result = await orgAPI.listOrganizations({
      headers: request.headers,
    });

    // Normalize metadata (Better-auth may return JSON string)
    const organizations = (result ?? []).map((org) => {
      let parsedMetadata: Record<string, {}> | null = null;

      if (org.metadata && typeof org.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(org.metadata) as Record<string, {}>;
        } catch (err) {
          logger.warn('Failed to parse organization metadata', {
            organizationId: org.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (org.metadata && typeof org.metadata === 'object') {
        parsedMetadata = org.metadata as Record<string, {}>;
      }

      return {
        id: org.id,
        name: org.name ?? null,
        slug: org.slug ?? null,
        metadata: parsedMetadata,
      };
    });

    logger.info('Organizations listed', {
      count: organizations.length,
      isSSR: typeof window === 'undefined',
    });

    return organizations;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Don't log auth failures as errors - they're expected for unauthenticated users
    if (errorMessage.includes('Authentication required') || errorMessage.includes('Unauthorized')) {
      logger.debug('Unauthenticated request for listOrganizations');
    } else {
      logger.error('Failed to list organizations', { error: errorMessage });
    }
    
    throw new Error('Failed to fetch organizations');
  }
});

/**
 * Sync active organization from URL to session
 *
 * This ensures that when users navigate to /:organizationId routes,
 * the session's activeOrganizationId is updated to match.
 *
 * Benefits:
 * - Deep links work immediately (no manual org selection needed)
 * - URL is the source of truth for current organization context
 * - Session state stays in sync with navigation
 *
 * @param organizationId - Organization ID or slug from URL
 * @param currentSessionOrgId - Current activeOrganizationId from session (optional)
 * @returns Updated organization or null if no change needed
 */
export const syncActiveOrganization = createServerFn({ method: 'POST' })
  .inputValidator((data: { organizationId: string; currentSessionOrgId?: string | null }) => data)
  .handler(async ({ data }) => {
    const env = getEnv();
    const request = getRequest();
    const auth = getAuth(env);
    const orgAPI = getOrganizationAPI(auth);

    // Get actual org ID (might be slug in URL)
    const org = await getOrganizationBySlugOrId(data.organizationId);
    if (!org) {
      logger.warn('Cannot sync - organization not found', {
        identifier: data.organizationId,
      });
      return { updated: false, reason: 'not_found' };
    }

    // Skip if already active
    if (data.currentSessionOrgId === org.id) {
      logger.debug('Skipping sync - organization already active', {
        organizationId: org.id,
      });
      return { updated: false, reason: 'already_active', organizationId: org.id };
    }

    try {
      // Update session to match URL
      await orgAPI.setActiveOrganization({
        body: { organizationId: org.id },
        headers: request.headers,
      });

      logger.info('Synced active organization from URL', {
        organizationId: org.id,
        previousOrgId: data.currentSessionOrgId,
        identifier: data.organizationId,
      });

      return { updated: true, organizationId: org.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to sync active organization', {
        organizationId: org.id,
        error: errorMessage,
      });

      // Don't throw - allow route to continue even if sync fails
      return { updated: false, reason: 'sync_failed', error: errorMessage };
    }
  });
