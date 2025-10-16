import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getAuth } from "@repo/data-ops/auth/server";
import { getOrganizationAPI } from "@repo/data-ops/auth/organization-api";
import { getRequest } from "@tanstack/react-start/server";
import { getCurrentUser } from "./utils/auth";
import { and, desc, eq } from "@repo/data-ops";

const logger = createLogger({ name: "organization-server" });

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
}).handler(async () => {
  try {
    const request = getRequest();
    const auth = getAuth();
    const user = await getCurrentUser();

    logger.info("Fetching organizations for user", { userId: user.id });

    const orgAPI = getOrganizationAPI(auth);
    const result = await orgAPI.listOrganizations({
      headers: request.headers,
    });

    logger.info("Organizations fetched", {
      userId: user.id,
      count: result?.length || 0,
    });

    return {
      success: true,
      organizations: result || [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch organizations", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      organizations: [],
    };
  }
});

/**
 * Create initial device/project during onboarding
 */
export const createProjectDevice = createServerFn({
  method: "POST",
})
  .inputValidator(
    (data: { projectName: string; organizationId: string; deviceId?: string | null; domain?: string }) => {
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
      const { getDb } = await import("@repo/data-ops/database/setup");
      const { devices } = await import("@repo/data-ops/schema");

      const db = getDb();

      if (data.deviceId) {
        logger.info("Updating project device during onboarding", {
          projectName: data.projectName,
          domain: data.domain,
          organizationId: data.organizationId,
          deviceId: data.deviceId,
        });

        const [device] = await db
          .update(devices)
          .set({
            name: data.projectName,
            notes: data.domain ? `Domain: ${data.domain}` : null,
          })
          .where(and(eq(devices.id, data.deviceId), eq(devices.organizationId, data.organizationId)))
          .returning();

        if (!device) {
          throw new Error("Project device not found");
        }

        logger.info("Project device updated successfully", {
          deviceId: device.id,
          organizationId: data.organizationId,
        });

        return {
          success: true,
          device,
        };
      }

      logger.info("Creating project device during onboarding", {
        projectName: data.projectName,
        domain: data.domain,
        organizationId: data.organizationId,
      });

      const [device] = await db
        .insert(devices)
        .values({
          organizationId: data.organizationId,
          name: data.projectName,
          notes: data.domain ? `Domain: ${data.domain}` : null,
          source: "ONBOARDING",
          scope: "INTERNAL",
          state: "AVAILABLE",
          verificationStatus: "VERIFIED", // Auto-verify devices created during onboarding
        })
        .returning();

      logger.info("Project device created successfully", {
        deviceId: device.id,
        organizationId: data.organizationId,
      });

      return {
        success: true,
        device,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create or update project device", {
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
      const { getDb } = await import("@repo/data-ops/database/setup");
      const { organization } = await import("@repo/data-ops/schema");

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
 * Determine onboarding progress for the current user.
 */
export const getOnboardingStatus = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    let currentUser:
      | {
          id: string;
          email: string | null;
          name: string | null;
          emailVerified: unknown;
        }
      | null = null;

    try {
      currentUser = await getCurrentUser();
    } catch (error) {
      logger.debug("No authenticated user while fetching onboarding status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const organizationsResult = await getUserOrganizations();
    const organizations = organizationsResult.organizations ?? [];
    const primaryOrganizationId = organizations[0]?.id ?? null;

    if (!primaryOrganizationId) {
      return {
        success: true,
        step: 1,
        organizationId: null,
        projectId: null,
        user: currentUser,
        organizations,
      };
    }

    const { getDb } = await import("@repo/data-ops/database/setup");
    const { devices, organization } = await import("@repo/data-ops/schema");

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

    let organizationMetadata: Record<string, unknown> | null = null;
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

    const [latestOnboardingDevice] = await db
      .select({
        id: devices.id,
        name: devices.name,
        notes: devices.notes,
      })
      .from(devices)
      .where(
        and(eq(devices.organizationId, primaryOrganizationId), eq(devices.source, "ONBOARDING"))
      )
      .orderBy(desc(devices.discoveredAt))
      .limit(1);

    const hasOnboardingDevice = Boolean(latestOnboardingDevice);

    // Extract domain from notes field (format: "Domain: example.com")
    let domain: string | undefined;
    if (latestOnboardingDevice?.notes) {
      const domainMatch = latestOnboardingDevice.notes.match(/^Domain:\s*(.+)$/);
      if (domainMatch) {
        domain = domainMatch[1];
      }
    }

    return {
      success: true,
      step: hasOnboardingDevice ? 3 : 2,
      organizationId: primaryOrganizationId,
      projectId: latestOnboardingDevice?.id ?? null,
      user: currentUser,
      organization: organizationRecord
        ? {
            id: organizationRecord.id,
            name: organizationRecord.name,
            metadata: organizationMetadata,
          }
        : null,
      project: latestOnboardingDevice
        ? {
            id: latestOnboardingDevice.id,
            name: latestOnboardingDevice.name,
            domain
          }
        : null,
      organizations,
    };
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
      error: errorMessage,
    };
  }
});
