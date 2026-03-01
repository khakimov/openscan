import { protectedProcedure, createTRPCRouter, requireOrganizationId } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createLogger } from "@repo/logger";
import { getErrorMessage } from '@/lib/utils';
import { requireOrgAccess } from '../utils/org-access';
import { parseJsonMetadata } from '../utils/metadata';
import {
  getDefaultProject,
  getOrganizationById as getOrgByIdData,
  getDevicesForTenant,
  validateOrganizationAccess,
  createProject,
  updateProject,
  updateOrganizationOnboarding as updateOrgOnboardingData,
  markOnboardingComplete as markOnboardingCompleteData,
} from "@repo/data-ops";
import { getAuth } from '@repo/data-ops/auth/server';
import { getOrganizationAPI } from '@repo/data-ops/auth/organization-api';
import type {
  OnboardingOrganizationSummary,
  OnboardingProjectSummary,
  OnboardingStatus,
  OnboardingUserSummary,
} from "@/server/types/onboarding";

const logger = createLogger({ name: "onboarding-router" });

/**
 * Onboarding tRPC Router
 *
 * Handles onboarding flow queries (status, organizations, projects, discovery devices)
 * Uses protectedProcedure - all onboarding routes require authentication
 */
export const onboardingRouter = createTRPCRouter({
  /**
   * Get onboarding status for current user
   * Determines which step of onboarding the user is on
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    // protectedProcedure ensures ctx.user is always available
    const currentUser: OnboardingUserSummary = {
      id: ctx.user.id,
      email: ctx.user.email ?? null,
      name: ctx.user.name ?? null,
      emailVerified: ctx.user.emailVerified,
      organizationId: ctx.user.organizationId ?? undefined,
    };
    let organizations: OnboardingOrganizationSummary[] = [];

    try {

      // Fetch organizations via Better Auth API
      const auth = getAuth(ctx.env);
      const orgAPI = getOrganizationAPI(auth);
      const orgResult = await orgAPI.listOrganizations({
        headers: ctx.request.headers,
      });

      // Normalize metadata (Better Auth stores as string)
      // orgResult is already the array of organizations, no .data property
      organizations = orgResult.map((org: any) => ({
        id: org.id,
        name: org.name,
        slug: org.slug ?? null,
        metadata: parseJsonMetadata(org.metadata),
      })) ?? [];

      const primaryOrganizationId = organizations[0]?.id ?? null;

      if (!primaryOrganizationId) {
        return {
          success: true,
          step: 1,
          organizationId: null,
          projectId: null,
          user: currentUser,
          organizations,
          onboardingCompleted: false,
        } satisfies OnboardingStatus;
      }

      // CRITICAL FIX: Bypass better-auth cache and read directly from database
      // better-auth caches organization metadata, so after completeOnboarding() is called,
      // getUserOrganizations() still returns stale data without onboardingCompleted=true
      const freshOrgData = await getOrgByIdData(primaryOrganizationId);

      const organizationMetadata = parseJsonMetadata(freshOrgData?.metadata);
      logger.debug("Organization metadata from database (fresh)", {
        organizationId: primaryOrganizationId,
        metadata: organizationMetadata,
        onboardingCompleted: organizationMetadata?.onboardingCompleted,
      });

      const organizationRecord = organizations.find(
        (org) => org.id === primaryOrganizationId,
      );

      const defaultProject = await getDefaultProject(primaryOrganizationId);

      const organizationSummary: OnboardingOrganizationSummary = {
        id: primaryOrganizationId,
        name: organizationRecord?.name ?? null,
        slug: organizationRecord?.slug ?? null,
        metadata: organizationMetadata,
      };

      const projectSummary: OnboardingProjectSummary | null = defaultProject
        ? {
            id: defaultProject.id,
            name: defaultProject.name ?? null,
            domain: defaultProject.domain ?? null,
          }
        : null;

      const onboardingCompleted =
        organizationMetadata?.onboardingCompleted === true;

      const storedMaxStep =
        typeof organizationMetadata?.maxOnboardingStep === "number"
          ? organizationMetadata.maxOnboardingStep
          : undefined;

      const inferredStep = defaultProject ? 3 : 2;
      const maxStep =
        storedMaxStep !== undefined
          ? Math.max(storedMaxStep, inferredStep)
          : inferredStep;

      return {
        success: true,
        step: maxStep as 2 | 3,
        organizationId: primaryOrganizationId,
        projectId: defaultProject?.id ?? null,
        user: currentUser,
        organization: organizationSummary,
        project: projectSummary,
        organizations,
        onboardingCompleted,
      } satisfies OnboardingStatus;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error("Failed to compute onboarding status", {
        error: errorMessage,
      });

      return {
        success: false,
        step: 1,
        organizationId: null,
        projectId: null,
        user: currentUser,
        organizations: [],
        onboardingCompleted: false,
        error: errorMessage,
      } satisfies OnboardingStatus;
    }
  }),

  /**
   * Get discovery devices for onboarding
   * Fetches devices discovered during onboarding flow
   */
  discoveryDevices: protectedProcedure
    .input(z.object({
      organizationId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        let organizationId: string;

        if (input.organizationId) {
          // Validate organization access when explicitly provided
          const orgAccess = await validateOrganizationAccess(
            ctx.user.id,
            input.organizationId
          );

          if (!orgAccess) {
            logger.warn("Organization access denied for discoveryDevices", {
              userId: ctx.user.id,
              attemptedOrganizationId: input.organizationId,
            });
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Organization not found or access denied',
            });
          }

          organizationId = orgAccess.id;
          logger.info("Fetching discovery devices with validated organization", {
            organizationId,
            userId: ctx.user.id,
            source: "onboarding",
          });
        } else {
          // Use organization from user context
          organizationId = requireOrganizationId(ctx);
          logger.info("Fetching discovery devices from session", {
            organizationId,
            userId: ctx.user.id,
            source: "session",
          });
        }

        const devicesResponse = await getDevicesForTenant(organizationId, {
          page: 1,
          pageSize: 100,
          sortColumn: "discoveredAt",
          sortDirection: "desc",
        });

        // Filter out onboarding devices (only show discovery devices)
        const discoveryDevices = devicesResponse.items.filter(
          (device: any) => device.source !== "ONBOARDING"
        );

        logger.info("Filtered discovery devices", {
          beforeFilter: devicesResponse.items.length,
          afterFilter: discoveryDevices.length,
        });

        return {
          success: true,
          devices: discoveryDevices.map((device: any) => ({
            id: device.id,
            name: device.name,
            ip: device.ip || null,
          })),
          count: discoveryDevices.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error("Failed to fetch discovery devices", {
          error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: getErrorMessage(error) || 'Failed to fetch discovery devices',
        });
      }
    }),

  /**
   * Create organization during onboarding
   * Replaces createOrganizationOnboarding server function
   */
  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2, 'Organization name must be at least 2 characters'),
        slug: z.string().optional(),
        timezone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        logger.info('Creating organization for user', {
          userId: ctx.user.id,
          organizationName: input.name,
          timezone: input.timezone,
        });

        const auth = getAuth(ctx.env);
        const orgAPI = getOrganizationAPI(auth);

        const result = await orgAPI.createOrganization({
          body: {
            name: input.name,
            slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            metadata: input.timezone ? { timezone: input.timezone } : undefined,
          },
          headers: ctx.request.headers,
        });

        logger.info('Organization created successfully', {
          organizationId: result?.id,
          userId: ctx.user.id,
        });

        if (result?.id) {
          await orgAPI.setActiveOrganization({
            body: { organizationId: result.id },
            headers: ctx.request.headers,
          });

          logger.info('Set active organization in session', {
            organizationId: result.id,
            userId: ctx.user.id,
          });
        }

        // Normalize createdAt (Better-auth may return Date or string)
        const createdAt =
          typeof result.createdAt === 'string'
            ? result.createdAt
            : result.createdAt?.toISOString?.() ?? new Date().toISOString();

        // Normalize metadata (Better-auth may return JSON string)
        const normalizedMetadata = parseJsonMetadata(result.metadata);

        return {
          organization: {
            id: result.id,
            name: result.name,
            slug: result.slug,
            logo: result.logo ?? null,
            metadata: normalizedMetadata,
            createdAt,
          },
        };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error('Failed to create organization', {
          error: errorMessage,
          input,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),

  /**
   * Create or update project during onboarding
   * Replaces createProjectOnboarding server function
   */
  createProject: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        projectId: z.string().optional().nullable(),
        projectName: z.string().min(2, 'Project name must be at least 2 characters'),
        domain: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const organizationId = await requireOrgAccess(ctx.user.id, input.organizationId);

        if (input.projectId) {
          logger.info('Updating project during onboarding', {
            projectId: input.projectId,
            projectName: input.projectName,
            domain: input.domain,
            organizationId,
            userId: ctx.user.id,
          });

          const project = await updateProject(input.projectId, organizationId, {
            name: input.projectName,
            domain: input.domain ?? undefined,
          });

          if (!project) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Project not found',
            });
          }

          logger.info('Project updated successfully', {
            projectId: project.id,
            organizationId,
            userId: ctx.user.id,
          });

          return { project };
        }

        logger.info('Creating project during onboarding', {
          projectName: input.projectName,
          domain: input.domain,
          organizationId,
          userId: ctx.user.id,
        });

        const project = await createProject(organizationId, {
          name: input.projectName,
          domain: input.domain ?? undefined,
          isDefault: true,
        });

        logger.info('Project created successfully', {
          projectId: project.id,
          organizationId,
          userId: ctx.user.id,
        });

        return { project };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = getErrorMessage(error);
        logger.error('Failed to create or update project', {
          error: errorMessage,
          input,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),

  /**
   * Update organization details during onboarding
   * Replaces updateOrganizationOnboarding server function
   */
  updateOrganization: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        name: z.string().min(2, 'Organization name must be at least 2 characters'),
        timezone: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const organizationId = await requireOrgAccess(ctx.user.id, input.organizationId);

        await updateOrgOnboardingData(organizationId, input.name, input.timezone ?? null);

        logger.info('Organization updated during onboarding', {
          organizationId,
          userId: ctx.user.id,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = getErrorMessage(error);
        logger.error('Failed to update organization during onboarding', {
          error: errorMessage,
          input,
        });

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: errorMessage,
        });
      }
    }),

  /**
   * Mark onboarding as complete
   * Replaces completeOnboarding server function
   */
  completeOnboarding: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const organizationId = await requireOrgAccess(ctx.user.id, input.organizationId);

        await markOnboardingCompleteData(organizationId);

        logger.info('Onboarding marked as complete', {
          organizationId,
          userId: ctx.user.id,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        const errorMessage = getErrorMessage(error);
        logger.error('Failed to mark onboarding as complete', {
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
