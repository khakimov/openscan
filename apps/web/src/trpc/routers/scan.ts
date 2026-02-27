import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import type { TrpcContext } from '../trpc';
import {
  getScanRunsWithArtifacts,
  validateProjectAccess,
  getOrganizationIdFromProject,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'scan-trpc' });

/**
 * Helper to require organizationId from protected context
 */
function requireOrganizationId(ctx: { user: NonNullable<TrpcContext['user']> }): string {
  const organizationId = ctx.user.organizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'User has no organizations. Please create an organization first.',
    });
  }
  return organizationId;
}

export const scanRouter = createTRPCRouter({
  /**
   * Get scan runs with artifacts for organization
   * Optionally filter by projectId
   */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let organizationId: string;
      let validatedProjectId: string | undefined = undefined;

      if (input.projectId) {
        // Derive organizationId from projectId (don't trust client's session)
        const derivedOrgId = await getOrganizationIdFromProject(input.projectId);

        if (!derivedOrgId) {
          logger.warn('Invalid projectId provided to scan.list', {
            projectId: input.projectId,
            userId: ctx.user.id,
          });
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied',
          });
        }

        // Validate user has access to BOTH project AND organization
        const access = await validateProjectAccess(
          ctx.user.id,
          input.projectId,
          derivedOrgId
        );

        if (!access) {
          logger.warn('Project access validation failed in scan.list', {
            userId: ctx.user.id,
            projectId: input.projectId,
            derivedOrgId,
          });
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Project not found or access denied',
          });
        }

        organizationId = access.organization.id;
        validatedProjectId = access.project.id;

        logger.info('Validated projectId for scan listing', {
          projectId: input.projectId,
          organizationId,
          userId: ctx.user.id,
        });
      } else {
        // No projectId provided - use session organizationId
        organizationId = requireOrganizationId(ctx);
        logger.info('Fetching scan runs from session', {
          organizationId,
          userId: ctx.user.id,
        });
      }

      try {
        const scans = await getScanRunsWithArtifacts(
          organizationId,
          validatedProjectId
        );

        logger.info('Retrieved scan runs', {
          organizationId,
          projectId: validatedProjectId,
          count: scans.length,
        });

        return scans;
      } catch (err) {
        logger.error('Failed to fetch scan runs', {
          error: err instanceof Error ? err.message : String(err),
          organizationId,
          projectId: validatedProjectId,
        });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch scans',
        });
      }
    }),
});
