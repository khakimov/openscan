import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import { getProjectsForOrganization, validateProjectAccess, createProject, validateOrganizationAccess } from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import { getErrorMessage } from '@/lib/utils';

const logger = createLogger({ name: 'project-router' });

export const projectRouter = createTRPCRouter({
  /**
   * Get a single project with access validation
   */
  get: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      projectId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        // Use ctx.user from protectedProcedure (OpenPanel pattern)
        // Avoids re-entering TanStack getRequest() and duplicate Better Auth lookup
        const user = ctx.user;

        const result = await validateProjectAccess(
          user.id,
          input.projectId,
          input.organizationId
        );

        if (!result) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found or access denied',
          });
        }

        // Return just the project (not the organization)
        return result.project;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to validate project access',
        });
      }
    }),

  /**
   * List all projects for a specific organization
   */
  listByOrg: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      try {
        const projects = await getProjectsForOrganization(input.organizationId);
        return projects;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to load projects',
        });
      }
    }),

  /**
   * Create a new project
   * Replaces createProjectData server function
   */
  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(1, 'Project name is required').max(100, 'Project name is too long'),
        description: z.string().optional(),
        domain: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Validate organization access
        const orgAccess = await validateOrganizationAccess(ctx.user.id, input.organizationId);

        if (!orgAccess) {
          logger.warn('Organization access denied during project creation', {
            userId: ctx.user.id,
            organizationId: input.organizationId,
          });
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Organization not found or access denied',
          });
        }

        const project = await createProject(orgAccess.id, {
          name: input.name,
          description: input.description,
          domain: input.domain,
        });

        logger.info('Project created', {
          organizationId: orgAccess.id,
          projectId: project.id,
          projectName: project.name,
          userId: ctx.user.id,
        });

        return { project };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = getErrorMessage(error);
        logger.error('Failed to create project', {
          error: errorMessage,
          input,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),
});
