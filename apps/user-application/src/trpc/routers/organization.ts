import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
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
        let parsedMetadata: Record<string, {}> | null = null;
        if (org.metadata) {
          try {
            parsedMetadata = JSON.parse(org.metadata) as Record<string, {}>;
          } catch (err) {
            logger.warn('Failed to parse organization metadata', {
              organizationId: org.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return {
          id: org.id,
          name: org.name ?? null,
          slug: org.slug ?? null,
          metadata: parsedMetadata,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = error instanceof Error ? error.message : String(error);
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
   * Used by: _app.tsx root loader for sidebar
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const auth = getAuth();
      const orgAPI = getOrganizationAPI(auth);

      // Better-auth organization API uses request context for session
      const result = await orgAPI.listOrganizations({
        headers: ctx.request.headers,
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

      return organizations;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to list organizations', { error: errorMessage });

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch organizations',
      });
    }
  }),
});
