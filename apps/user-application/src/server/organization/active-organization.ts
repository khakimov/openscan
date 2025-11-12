import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createLogger } from "@repo/logger";
import { getAuth } from "@repo/data-ops/auth/server";
import { getActiveOrganizationId } from "@repo/data-ops/auth/organization-api";
import { validateOrganizationAccess, getOrganizationById as getOrgByIdData } from "@repo/data-ops";
import { getCurrentUser } from "../utils/auth";

const logger = createLogger({
  name: "organization-server:active-organization",
});

/**
 * Get active organization from session.
 */
export const getActiveOrganization = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const request = getRequest();
    const auth = getAuth();

    const session = await auth.api.getSession(request);
    const activeOrgId = session ? getActiveOrganizationId(session) : null;

    if (!activeOrgId) {
      return {
        success: false,
        organization: null,
      };
    }

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
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("Failed to get active organization", {
      error: errorMessage,
    });

    return {
      success: false,
      organization: null,
      error: errorMessage,
    };
  }
});

/**
 * Get organization by identifier, ensuring the current user has access.
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

      const org = await validateOrganizationAccess(user.id, organizationIdentifier);
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to get organization by identifier", {
        organizationIdentifier,
        error: errorMessage,
      });

      throw error; // Re-throw to trigger 404
    }
  });

