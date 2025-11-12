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

    logger.debug("Session data", {
      hasSession: !!session,
      userId: session?.user?.id,
      sessionData: session ? JSON.stringify(session, null, 2) : null,
    });

    const activeOrgId = session ? getActiveOrganizationId(session) : null;

    logger.debug("Active organization ID from session", {
      activeOrgId,
      sessionKeys: session ? Object.keys(session) : [],
    });

    if (!activeOrgId) {
      logger.warn("No active organization ID found in session", {
        userId: session?.user?.id,
      });

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

        // Return specific error codes for better client-side handling
        return {
          success: false,
          organization: null,
          error: "Organization not found or access denied",
          statusCode: 403, // Forbidden - user doesn't have access
        };
      }

      logger.info("Organization accessed", {
        organizationId: org.id,
        organizationSlug: org.slug,
        accessedVia: organizationIdentifier,
        userId: user.id,
        userRole: org.userRole,
      });

      // Parse metadata safely - invalid JSON shouldn't block access
      // Cast to Record<string, {}> to match TanStack type expectations
      let parsedMetadata: Record<string, {}> | null = null;
      if (org.metadata) {
        try {
          parsedMetadata = JSON.parse(org.metadata) as Record<string, {}>;
        } catch (err) {
          logger.warn("Failed to parse organization metadata", {
            organizationId: org.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        success: true,
        organization: {
          id: org.id,
          name: org.name ?? null,
          slug: org.slug ?? null,
          metadata: parsedMetadata,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to get organization by identifier", {
        organizationIdentifier,
        error: errorMessage,
      });

      // Return unsuccessful result instead of throwing
      // Throwing causes 500, returning { success: false } lets route handle 404
      return {
        success: false,
        organization: null,
        error: errorMessage,
      };
    }
  });

