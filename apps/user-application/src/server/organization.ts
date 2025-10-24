import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI, getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { getRequest } from "@tanstack/react-start/server";
import { getDb } from "@repo/data-ops/database/setup";
import { organization, projects } from "@repo/data-ops/schema";
import { and, eq, or } from "@repo/data-ops";
import { createProject, updateProject } from "@repo/data-ops";
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
      // If projectId provided, update existing project
      if (data.projectId) {
        logger.info("Updating project during onboarding", {
          projectId: data.projectId,
          projectName: data.projectName,
          domain: data.domain,
          organizationId: data.organizationId,
        });

        const project = await updateProject(
          data.projectId,
          data.organizationId,
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
          organizationId: data.organizationId,
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
        organizationId: data.organizationId,
      });

      const project = await createProject(data.organizationId, {
        name: data.projectName,
        domain: data.domain,
        isDefault: true, // First project created during onboarding is default
      });

      logger.info("Project created successfully", {
        projectId: project.id,
        organizationId: data.organizationId,
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
 * Update organization details during onboarding
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
      const db = getDb();
      const [existing] = await db
        .select({
          metadata: organization.metadata,
        })
        .from(organization)
        .where(eq(organization.id, data.organizationId))
        .limit(1);

      let metadataObj: Record<string, unknown> = {};
      if (existing?.metadata) {
        try {
          metadataObj = JSON.parse(existing.metadata);
        } catch (err) {
          logger.warn("Failed to parse organization metadata, resetting", {
            organizationId: data.organizationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (data.timezone) {
        metadataObj.timezone = data.timezone;
      }

      await db
        .update(organization)
        .set({
          name: data.name,
          metadata: Object.keys(metadataObj).length ? JSON.stringify(metadataObj) : null,
        })
        .where(eq(organization.id, data.organizationId));

      logger.info("Organization updated during onboarding", {
        organizationId: data.organizationId,
        timezone: data.timezone,
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
 * Mark onboarding as complete for the organization
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
      const db = getDb();
      const [existing] = await db
        .select({
          metadata: organization.metadata,
        })
        .from(organization)
        .where(eq(organization.id, data.organizationId))
        .limit(1);

      let metadataObj: Record<string, unknown> = {};
      if (existing?.metadata) {
        try {
          metadataObj = JSON.parse(existing.metadata);
        } catch (err) {
          logger.warn("Failed to parse organization metadata, resetting", {
            organizationId: data.organizationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Mark onboarding as complete
      metadataObj.onboardingCompleted = true;
      metadataObj.onboardingCompletedAt = new Date().toISOString();

      await db
        .update(organization)
        .set({
          metadata: JSON.stringify(metadataObj),
        })
        .where(eq(organization.id, data.organizationId));

      logger.info("Onboarding marked as complete", {
        organizationId: data.organizationId,
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
 * Get active organization from session
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

    // Query organization from database using data-ops
    const db = getDb();
    const [org] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, activeOrgId))
      .limit(1);

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

    const db = getDb();
    const [organizationRecord] = await db
      .select({
        id: organization.id,
        name: organization.name,
        metadata: organization.metadata,
      })
      .from(organization)
      .where(eq(organization.id, primaryOrganizationId))
      .limit(1);

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

    // Query for default project (created during onboarding)
    const [defaultProject] = await db
      .select({
        id: projects.id,
        name: projects.name,
        domain: projects.domain,
      })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, primaryOrganizationId),
          eq(projects.isDefault, true)
        )
      )
      .limit(1);

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

    return {
      success: true,
      step: hasProject ? 3 : 2,
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
 * Get organization by slug or ID and validate user has access
 * Follows OpenPanel pattern: accepts slug (preferred) or ID as fallback
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
      const db = getDb();

      // Query organization by slug OR id (OpenPanel pattern)
      // Try slug first (cleaner URLs), fallback to ID
      const [org] = await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          metadata: organization.metadata,
        })
        .from(organization)
        .where(
          or(
            eq(organization.slug, organizationIdentifier),
            eq(organization.id, organizationIdentifier)
          )
        )
        .limit(1);

      if (!org) {
        throw new Error("Organization not found");
      }

      // TODO: Add membership check once we have member/role tables
      // For now, assume user has access if organization exists

      logger.info("Organization accessed", {
        organizationId: org.id,
        organizationSlug: org.slug,
        accessedVia: organizationIdentifier,
        userId: user.id,
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
