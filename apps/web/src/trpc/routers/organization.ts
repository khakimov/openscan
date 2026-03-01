import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import { parseJsonMetadata } from '../utils/metadata';
import { getErrorMessage } from '@/lib/utils';
import { getAuth } from '@repo/data-ops/auth/server';
import { getOrganizationAPI } from '@repo/data-ops/auth/organization-api';
import {
  validateOrganizationAccess,
  getOrganizationBySlugOrId,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'organization-router' });

export const organizationRouter = createTRPCRouter({
  /**
   * Get a single organization by ID or slug with access validation
   * Replaces getOrganizationById server function
   */
  get: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const access = await validateOrganizationAccess(ctx.user.id, input.organizationId);

        if (!access) {
          // Differentiate: Does org exist but user lacks access (403) or does it not exist (404)?
          const orgRecord = await getOrganizationBySlugOrId(input.organizationId);

          if (!orgRecord) {
            logger.warn('Organization not found', {
              userId: ctx.user.id,
              organizationIdentifier: input.organizationId,
            });

            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Organization not found',
            });
          }

          logger.warn('Organization access denied', {
            userId: ctx.user.id,
            organizationIdentifier: input.organizationId,
            organizationId: orgRecord.id,
          });

          throw new TRPCError({
            code: 'FORBIDDEN',
            message: "You don't have access to this organization",
          });
        }

        const org = access;

        logger.info('Organization accessed', {
          organizationId: org.id,
          organizationSlug: org.slug,
          accessedVia: input.organizationId,
          userId: ctx.user.id,
          userRole: org.userRole,
        });

        // Parse metadata safely - invalid JSON shouldn't block access
        const parsedMetadata = parseJsonMetadata(org.metadata);

        return {
          id: org.id,
          name: org.name ?? null,
          slug: org.slug ?? null,
          metadata: parsedMetadata,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = getErrorMessage(error);
        logger.error('Failed to get organization by identifier', {
          organizationIdentifier: input.organizationId,
          error: errorMessage,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected error while fetching organization',
        });
      }
    }),

  /**
   * List all organizations for the current user
   * Replaces getUserOrganizations server function
   *
   * Used by: _app.tsx root loader for sidebar, org picker
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const auth = getAuth(ctx.env);
      const orgAPI = getOrganizationAPI(auth);

      // Better-auth organization API uses request context for session
      const result = await orgAPI.listOrganizations({
        headers: ctx.request.headers,
      });

      // Normalize metadata (Better-auth may return JSON string)
      const organizations = (result ?? []).map((org) => {
        return {
          id: org.id,
          name: org.name ?? null,
          slug: org.slug ?? null,
          metadata: parseJsonMetadata(org.metadata),
        };
      });

      return {
        organizations,
        activeOrganizationId: ctx.user.organizationId,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list organizations', { error: errorMessage });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch organizations',
      });
    }
  }),

  /**
   * Set the active organization for the current user
   * Stores Set-Cookie headers so tRPC route handler can forward them
   */
  setActive: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const auth = getAuth(ctx.env);
        const orgAPI = getOrganizationAPI(auth);

        logger.info('Setting active organization', {
          userId: ctx.user.id,
          organizationId: input.organizationId,
        });

        // Call Better Auth to update session
        const response = await orgAPI.setActiveOrganization({
          body: { organizationId: input.organizationId },
          headers: ctx.request.headers,
          returnHeaders: true,
        });

        // Extract Set-Cookie headers from response
        const setCookieHeaders: string[] = [];
        response.headers?.forEach?.((value, key) => {
          if (key.toLowerCase() === 'set-cookie') {
            setCookieHeaders.push(value);
          }
        });

        logger.info('Extracted Set-Cookie headers from org API', {
          count: setCookieHeaders.length,
        });

        // Store headers for route handler to forward
        ctx.setPendingCookies(setCookieHeaders);

        return {
          success: true,
          organization: response.response,
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error('Failed to set active organization', {
          organizationId: input.organizationId,
          error: errorMessage,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to set active organization',
        });
      }
    }),

  /**
   * Sync active organization from URL to session
   *
   * Called by _app.$organizationId route when URL org differs from session org.
   * Resolves slug → ID if needed, then updates session.
   */
  syncActive: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        currentSessionOrgId: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const auth = getAuth(ctx.env);
      const orgAPI = getOrganizationAPI(auth);

      // Get actual org ID (might be slug in URL)
      const org = await getOrganizationBySlugOrId(input.organizationId);
      if (!org) {
        logger.warn("Cannot sync - organization not found", {
          identifier: input.organizationId,
        });
        return { updated: false, reason: "not_found" };
      }

      // Skip if already active
      if (input.currentSessionOrgId === org.id) {
        return {
          updated: false,
          reason: "already_active",
          organizationId: org.id,
        };
      }

      try {
        const response = await orgAPI.setActiveOrganization({
          body: { organizationId: org.id },
          headers: ctx.request.headers,
          returnHeaders: true,
        });

        // Forward Set-Cookie headers
        const setCookieHeaders: string[] = [];
        response.headers?.forEach?.((value, key) => {
          if (key.toLowerCase() === "set-cookie") {
            setCookieHeaders.push(value);
          }
        });
        ctx.setPendingCookies(setCookieHeaders);

        logger.info("Synced active organization from URL", {
          organizationId: org.id,
          previousOrgId: input.currentSessionOrgId,
          identifier: input.organizationId,
        });

        return { updated: true, organizationId: org.id };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error("Failed to sync active organization", {
          organizationId: org.id,
          error: errorMessage,
        });

        // Don't throw - allow route to continue even if sync fails
        return { updated: false, reason: "sync_failed", error: errorMessage };
      }
    }),
});
