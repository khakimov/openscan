import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI, getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { getRequest } from "@tanstack/react-start/server";
import {
  createProject,
  updateProject,
  validateOrganizationAccess,
  updateOrganizationOnboarding as updateOrgOnboardingData,
  markOnboardingComplete as markOnboardingCompleteData,
  getOrganizationById as getOrgByIdData,
  getDefaultProject,
} from "@repo/data-ops";
import { getCurrentUser } from "./utils/auth";
import type {
  OnboardingOrganizationSummary,
  OnboardingProjectSummary,
  OnboardingStatus,
  OnboardingUserSummary,
} from "./types/onboarding";

const logger = createLogger({ name: "organization-server" });

type UserOrganizationsResult =
  | {
      success: true;
      organizations: {
        id: string;
        name: string | null;
        metadata: Record<string, {}> | null;
      }[];
      error?: undefined;
    }
  | {
      success: false;
      organizations: {
        id: string;
        name: string | null;
        metadata: Record<string, {}> | null;
      }[];
      error: string;
    };

/**
 * Create organization for the current user during onboarding
 */
export const createOrganizationOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator((data: { name: string; slug?: string; timezone?: string }) => {
    console.log('[createOrganizationOnboarding] inputValidator received:', JSON.stringify(data));
    if (!data?.name || data.name.trim().length < 2) {
      throw new Error("Organization name must be at least 2 characters");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const request = getRequest();
      const auth = getAuth();
      const user = await getCurrentUser();

      logger.info("Creating organization for user", {
        userId: user.id,
        organizationName: data.name,
        timezone: data.timezone,
      });

      // Use better-auth organization plugin to create organization
      const orgAPI = getOrganizationAPI(auth);
      const result = await orgAPI.createOrganization({
        body: {
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          metadata: data.timezone ? { timezone: data.timezone } : undefined,
        },
        headers: request.headers,
      });

      logger.info("Organization created successfully", {
        organizationId: result?.id,
        userId: user.id,
      });

      // Set the newly created organization as the active organization in the session
      if (result?.id) {
        await orgAPI.setActiveOrganization({
          body: {
            organizationId: result.id,
          },
          headers: request.headers,
        });

        logger.info("Set active organization in session", {
          organizationId: result.id,
          userId: user.id,
        });
      }

      return {
        success: true,
        organization: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create organization", {
        error: errorMessage,
        data,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

/**
 * Get current user's organizations
 */
export const getUserOrganizations = createServerFn({
  method: "GET",
}).handler(async (): Promise<UserOrganizationsResult> => {
  try {
    const request = getRequest();
    const auth = getAuth();
    const user = await getCurrentUser();

    logger.info("Fetching organizations for user", { userId: user.id });

    const orgAPI = getOrganizationAPI(auth);
    const result = await orgAPI.listOrganizations({
      headers: request.headers,
    });

    // Transform Organization[] from better-auth to match expected type
    // better-auth metadata is string | null | undefined, we need Record<string, {}> | null
    const organizations: UserOrganizationsResult["organizations"] = (result ?? []).map((org) => {
      let parsedMetadata: Record<string, {}> | null = null;
      if (org.metadata && typeof org.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(org.metadata);
        } catch (err) {
          logger.warn("Failed to parse organization metadata", {
            organizationId: org.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (org.metadata && typeof org.metadata === 'object') {
        // If metadata is already an object, use it directly
        parsedMetadata = org.metadata as Record<string, {}>;
      }

      return {
        id: org.id,
        name: org.name ?? null,
        metadata: parsedMetadata,
      };
    });

    logger.info("Organizations fetched", {
      userId: user.id,
      count: organizations.length,
    });

    return {
      success: true,
      organizations,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch organizations", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      organizations: [] as UserOrganizationsResult["organizations"],
    };
  }
});

/**
 * Create initial project during onboarding
 */
export const createProjectOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: { projectName: string; organizationId: string; projectId?: string | null; domain?: string }) => {
      if (!data?.projectName || data.projectName.trim().length < 2) {
        throw new Error("Project name must be at least 2 characters");
      }
      if (!data?.organizationId) {
        throw new Error("Organization ID is required");
      }
      return data;
    }
  )
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId
      );

      if (!orgAccess) {
        logger.warn("Organization access denied during project onboarding", {
          userId: user.id,
          organizationId: data.organizationId,
          projectId: data.projectId,
        });
        throw new Error("Organization not found or access denied");
      }

      const organizationId = orgAccess.id;

      // If projectId provided, update existing project
      if (data.projectId) {
        logger.info("Updating project during onboarding", {
          projectId: data.projectId,
          projectName: data.projectName,
          domain: data.domain,
          organizationId,
          userId: user.id,
        });

        const project = await updateProject(
          data.projectId,
          organizationId,
          {
            name: data.projectName,
            domain: data.domain,
          }
        );

        if (!project) {
          throw new Error("Project not found");
        }

        logger.info("Project updated successfully", {
          projectId: project.id,
          organizationId,
          userId: user.id,
        });

        return {
          success: true,
          project,
        };
      }

      // Create new project
      logger.info("Creating project during onboarding", {
        projectName: data.projectName,
        domain: data.domain,
        organizationId,
        userId: user.id,
      });

      const project = await createProject(organizationId, {
        name: data.projectName,
        domain: data.domain,
        isDefault: true, // First project created during onboarding is default
      });

      logger.info("Project created successfully", {
        projectId: project.id,
        organizationId,
        userId: user.id,
      });

      return {
        success: true,
        project,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create or update project", {
        error: errorMessage,
        data,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

/**
 * Update organization details during onboarding (REFACTORED - sec-85)
 *
 * Now uses data-ops updateOrganizationOnboarding function
 */
export const updateOrganizationOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: { organizationId: string; name: string; timezone?: string | null }) => {
      if (!data?.organizationId) {
        throw new Error("Organization ID is required");
      }
      if (!data?.name || data.name.trim().length < 2) {
        throw new Error("Organization name must be at least 2 characters");
      }
      return data;
    }
  )
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId
      );

      if (!orgAccess) {
        logger.warn("Organization update denied during onboarding", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

      // ✅ CLEAN: All business logic in data-ops
      await updateOrgOnboardingData(
        orgAccess.id,
        data.name,
        data.timezone
      );

      logger.info("Organization updated during onboarding", {
        organizationId: orgAccess.id,
        timezone: data.timezone,
        userId: user.id,
      });

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to update organization during onboarding", {
        error: errorMessage,
        data,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

/**
 * Update the maximum onboarding step reached
 */
export const updateOnboardingStep = createServerFn({
  method: "POST",
})
  .inputValidator((data: { organizationId: string; step: number }) => {
    if (!data?.organizationId) {
      throw new Error("Organization ID is required");
    }
    if (typeof data?.step !== 'number' || data.step < 1 || data.step > 4) {
      throw new Error("Step must be between 1 and 4");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId
      );

      if (!orgAccess) {
        logger.warn("Organization access denied when updating onboarding step", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

      // Get existing organization and metadata
      const org = await getOrgByIdData(orgAccess.id);
      let metadata: Record<string, unknown> = {};

      if (org?.metadata) {
        try {
          metadata = JSON.parse(org.metadata);
        } catch (err) {
          logger.warn("Failed to parse organization metadata", {
            organizationId: orgAccess.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Update maxOnboardingStep only if new step is higher
      const currentMaxStep = typeof metadata.maxOnboardingStep === 'number'
        ? metadata.maxOnboardingStep
        : 1;

      if (data.step > currentMaxStep) {
        metadata.maxOnboardingStep = data.step;

        // Update organization metadata
        await updateOrgOnboardingData(
          orgAccess.id,
          org?.name ?? "Organization",
          typeof metadata.timezone === 'string' ? metadata.timezone : null
        );

        // Manually update metadata since updateOrgOnboardingData doesn't handle maxOnboardingStep
        const db = (await import("@repo/data-ops/database/setup")).getDb();
        const { organization } = await import("@repo/data-ops/drizzle/auth-schema");
        const { eq } = await import("drizzle-orm");

        await db
          .update(organization)
          .set({
            metadata: JSON.stringify(metadata),
          })
          .where(eq(organization.id, orgAccess.id));

        logger.info("Onboarding step updated", {
          organizationId: orgAccess.id,
          step: data.step,
          userId: user.id,
        });
      }

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to update onboarding step", {
        error: errorMessage,
        data,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

/**
 * Mark onboarding as complete for the organization (REFACTORED - sec-85)
 *
 * Now uses data-ops markOnboardingComplete function
 */
export const completeOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator((data: { organizationId: string }) => {
    if (!data?.organizationId) {
      throw new Error("Organization ID is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId
      );

      if (!orgAccess) {
        logger.warn("Organization access denied when completing onboarding", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

      // ✅ CLEAN: All business logic in data-ops
      await markOnboardingCompleteData(orgAccess.id);

      logger.info("Onboarding marked as complete", {
        organizationId: orgAccess.id,
        userId: user.id,
      });

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to mark onboarding as complete", {
        error: errorMessage,
        data,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });

/**
 * Get active organization from session (REFACTORED - sec-85)
 *
 * Now uses data-ops getOrganizationById function
 */
export const getActiveOrganization = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const request = getRequest();
    const auth = getAuth();

    // Get session and extract active organization ID
    const session = await auth.api.getSession(request);
    const activeOrgId = session ? getActiveOrganizationId(session) : null;

    if (!activeOrgId) {
      return {
        success: false,
        organization: null,
      };
    }

    // ✅ CLEAN: Use data-ops function
    const org = await getOrgByIdData(activeOrgId);

    if (!org) {
      return {
        success: false,
        organization: null,
      };
    }

    return {
      success: true,
      organization: {
        id: org.id,
        name: org.name ?? null,
        slug: org.slug ?? null,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get active organization", { error: errorMessage });

    return {
      success: false,
      organization: null,
      error: errorMessage,
    };
  }
});

/**
 * Determine onboarding progress for the current user.
 */
export const getOnboardingStatus = createServerFn({
  method: "GET",
}).handler(async (): Promise<OnboardingStatus> => {
  let currentUser: OnboardingUserSummary | null = null;
  let organizations: OnboardingOrganizationSummary[] = [];

  try {
    try {
      const rawUser = await getCurrentUser();
      currentUser = {
        id: rawUser.id,
        email: rawUser.email ?? null,
        name: rawUser.name ?? null,
        emailVerified: Boolean(rawUser.emailVerified),
        organizationId: rawUser.organizationId,
      };
    } catch (error) {
      logger.debug("No authenticated user while fetching onboarding status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const organizationsResult = await getUserOrganizations();
    organizations = organizationsResult.organizations.map((org) => ({
      id: org.id,
      name: org.name ?? null,
      metadata: org.metadata ?? null,
    }));

    if (!organizationsResult.success && organizationsResult.error) {
      logger.warn("Proceeding without organizations due to fetch error", {
        error: organizationsResult.error,
      });
    }

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

    // ✅ CLEAN: Use data-ops function to get organization
    const organizationRecord = await getOrgByIdData(primaryOrganizationId);

    let organizationMetadata: Record<string, {}> | null = null;
    if (organizationRecord?.metadata) {
      try {
        organizationMetadata = JSON.parse(organizationRecord.metadata);
      } catch (err) {
        logger.warn("Failed to parse organization metadata", {
          organizationId: primaryOrganizationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ✅ CLEAN: Use data-ops function to get default project
    const defaultProject = await getDefaultProject(primaryOrganizationId);

    const hasProject = Boolean(defaultProject);

    const organizationSummary: OnboardingOrganizationSummary | null = organizationRecord
      ? {
          id: organizationRecord.id,
          name: organizationRecord.name ?? null,
          metadata: organizationMetadata,
        }
      : null;

    const projectSummary: OnboardingProjectSummary | null = defaultProject
      ? {
          id: defaultProject.id,
          name: defaultProject.name ?? null,
          domain: defaultProject.domain ?? null,
        }
      : null;

    // Check if onboarding is complete from organization metadata
    const onboardingCompleted = organizationMetadata?.onboardingCompleted === true;

    // Track the highest step reached - stored in metadata or inferred from data
    // Step 1: Account created (always true if we have user)
    // Step 2: Organization exists
    // Step 3: Project exists
    // Step 4: Reached notifications (stored in metadata.maxOnboardingStep)
    const storedMaxStep = typeof organizationMetadata?.maxOnboardingStep === 'number'
      ? organizationMetadata.maxOnboardingStep
      : undefined;

    const inferredStep = hasProject ? 3 : 2;
    const maxStep = storedMaxStep !== undefined ? Math.max(storedMaxStep, inferredStep) : inferredStep;

    return {
      success: true,
      step: maxStep as 2 | 3, // Type assertion: maxStep is calculated from 2 or 3
      organizationId: primaryOrganizationId,
      projectId: defaultProject?.id ?? null,
      user: currentUser,
      organization: organizationSummary,
      project: projectSummary,
      organizations,
      onboardingCompleted,
    } satisfies OnboardingStatus;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to compute onboarding status", { error: errorMessage });

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
});

/**
 * Get organization by slug or ID and validate user has access (VULN-002 FIX - REFACTORED)
 *
 * Now just a thin wrapper around data-ops validateOrganizationAccess function.
 * All business logic lives in data-ops for better reusability.
 */
export const getOrganizationById = createServerFn({
  method: "GET",
})
  .inputValidator((organizationIdentifier: string) => {
    if (!organizationIdentifier) {
      throw new Error("Organization identifier is required");
    }
    return organizationIdentifier;
  })
  .handler(async ({ data: organizationIdentifier }) => {
    try {
      const user = await getCurrentUser();

      // ✅ CLEAN: All business logic in data-ops
      const org = await validateOrganizationAccess(
        user.id,
        organizationIdentifier
      );

      if (!org) {
        logger.warn("Organization access denied", {
          userId: user.id,
          organizationIdentifier,
        });
        throw new Error("Organization not found or access denied");
      }

      logger.info("Organization accessed", {
        organizationId: org.id,
        organizationSlug: org.slug,
        accessedVia: organizationIdentifier,
        userId: user.id,
        userRole: org.userRole,
      });

      return {
        success: true,
        organization: {
          id: org.id,
          name: org.name ?? null,
          slug: org.slug ?? null,
          metadata: org.metadata ? JSON.parse(org.metadata) : null,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get organization", {
        error: errorMessage,
        identifier: organizationIdentifier,
      });

      throw error; // Re-throw to trigger 404
    }
  });
