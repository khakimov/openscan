import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createLogger } from "@repo/logger";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI } from "@repo/data-ops/auth/organization-api";
import {
  createProject,
  updateProject,
  validateOrganizationAccess,
  updateOrganizationOnboarding as updateOrgOnboardingData,
  markOnboardingComplete as markOnboardingCompleteData,
  getOrganizationById as getOrgByIdData,
} from "@repo/data-ops";
import { getCurrentUser } from "../utils/auth";
import type { UserOrganizationsResult } from "./types";

const logger = createLogger({ name: "organization-server:onboarding" });

/**
 * Create organization for the current user during onboarding.
 */
export const createOrganizationOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator((data: { name: string; slug?: string; timezone?: string }) => {
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

      const orgAPI = getOrganizationAPI(auth);
      const result = await orgAPI.createOrganization({
        body: {
          name: data.name,
          slug:
            data.slug ||
            data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          metadata: data.timezone ? { timezone: data.timezone } : undefined,
        },
        headers: request.headers,
      });

      logger.info("Organization created successfully", {
        organizationId: result?.id,
        userId: user.id,
      });

      if (result?.id) {
        await orgAPI.setActiveOrganization({
          body: { organizationId: result.id },
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
 * Get current user's organizations.
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

    const organizations: UserOrganizationsResult["organizations"] =
      (result ?? []).map((org) => {
        let parsedMetadata: Record<string, {}> | null = null;

        if (org.metadata && typeof org.metadata === "string") {
          try {
            parsedMetadata = JSON.parse(org.metadata);
          } catch (err) {
            logger.warn("Failed to parse organization metadata", {
              organizationId: org.id,
              error:
                err instanceof Error ? err.message : String(err),
            });
          }
        } else if (org.metadata && typeof org.metadata === "object") {
          parsedMetadata = org.metadata as Record<string, {}>;
        }

        return {
          id: org.id,
          name: org.name ?? null,
          metadata: parsedMetadata,
        };
      });

    return { success: true, organizations };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    logger.error("Failed to fetch user organizations", {
      error: errorMessage,
    });

    return {
      success: false,
      organizations: [],
      error: errorMessage,
    };
  }
});

/**
 * Create or update a project during onboarding.
 */
export const createProjectOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: {
      organizationId: string;
      projectId?: string | null;
      projectName: string;
      domain?: string | null;
    }) => {
      if (!data?.organizationId) {
        throw new Error("Organization ID is required");
      }
      if (!data?.projectName || data.projectName.trim().length < 2) {
        throw new Error("Project name must be at least 2 characters");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId,
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

      if (data.projectId) {
        logger.info("Updating project during onboarding", {
          projectId: data.projectId,
          projectName: data.projectName,
          domain: data.domain,
          organizationId,
          userId: user.id,
        });

        const project = await updateProject(data.projectId, organizationId, {
          name: data.projectName,
          domain: data.domain ?? undefined,
        });

        if (!project) {
          throw new Error("Project not found");
        }

        logger.info("Project updated successfully", {
          projectId: project.id,
          organizationId,
          userId: user.id,
        });

        return { success: true, project };
      }

      logger.info("Creating project during onboarding", {
        projectName: data.projectName,
        domain: data.domain,
        organizationId,
        userId: user.id,
      });

      const project = await createProject(organizationId, {
        name: data.projectName,
        domain: data.domain ?? undefined,
        isDefault: true,
      });

      logger.info("Project created successfully", {
        projectId: project.id,
        organizationId,
        userId: user.id,
      });

      return { success: true, project };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
 * Update organization details during onboarding.
 */
export const updateOrganizationOnboarding = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: {
      organizationId: string;
      name: string;
      timezone?: string | null;
    }) => {
      if (!data?.organizationId) {
        throw new Error("Organization ID is required");
      }
      if (!data?.name || data.name.trim().length < 2) {
        throw new Error("Organization name must be at least 2 characters");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId,
      );

      if (!orgAccess) {
        logger.warn("Organization update denied during onboarding", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

      await updateOrgOnboardingData(
        orgAccess.id,
        data.name,
        data.timezone ?? null,
      );

      logger.info("Organization updated during onboarding", {
        organizationId: orgAccess.id,
        userId: user.id,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
 * Persist the highest onboarding step reached.
 */
export const updateOnboardingStep = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: { organizationId: string; step: number }) => {
      if (!data?.organizationId) {
        throw new Error("Organization ID is required");
      }
      if (typeof data.step !== "number" || data.step < 1) {
        throw new Error("Step must be a positive number");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    try {
      const user = await getCurrentUser();

      const orgAccess = await validateOrganizationAccess(
        user.id,
        data.organizationId,
      );

      if (!orgAccess) {
        logger.warn("Organization access denied when updating step", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

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

      const currentMaxStep =
        typeof metadata.maxOnboardingStep === "number"
          ? metadata.maxOnboardingStep
          : 1;

      if (data.step > currentMaxStep) {
        metadata.maxOnboardingStep = data.step;

        await updateOrgOnboardingData(
          orgAccess.id,
          org?.name ?? "Organization",
          typeof metadata.timezone === "string" ? metadata.timezone : null,
        );

        const db = (await import("@repo/data-ops/database/setup")).getDb();
        const { organization } = await import(
          "@repo/data-ops/drizzle/auth-schema"
        );
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

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
 * Mark onboarding as complete for the organization.
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
        data.organizationId,
      );

      if (!orgAccess) {
        logger.warn("Organization access denied when completing onboarding", {
          userId: user.id,
          organizationId: data.organizationId,
        });
        throw new Error("Organization not found or access denied");
      }

      await markOnboardingCompleteData(orgAccess.id);

      logger.info("Onboarding marked as complete", {
        organizationId: orgAccess.id,
        userId: user.id,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

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
