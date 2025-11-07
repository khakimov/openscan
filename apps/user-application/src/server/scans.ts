import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import {
  getScanRunsWithArtifacts,
  getOrganizationIdFromProject,
  validateProjectAccess,
} from "@repo/data-ops";
import { getCurrentOrganizationId, getCurrentUser } from "./utils/auth";
import { z } from "zod";

const logger = createLogger({ name: "scans-server" });

const GetScansSchema = z.object({
  projectId: z.string().optional(),
});

/**
 * Get all scan runs with artifacts for the current organization
 * Optionally filter by projectId
 */
export const getScans = createServerFn({
  method: "POST",
})
  .inputValidator(GetScansSchema.parse)
  .handler(async ({ data }) => {
    try {
      // ✅ VULN-002 FIX: Validate projectId before using it
      const user = await getCurrentUser();
      let organizationId: string;
      let validatedProjectId: string | undefined = undefined;

      if (data?.projectId) {
        // Derive organizationId from projectId (don't trust client's session)
        const derivedOrgId = await getOrganizationIdFromProject(data.projectId);

        if (!derivedOrgId) {
          logger.warn('Invalid projectId provided to getScans', {
            projectId: data.projectId,
            userId: user.id,
          });
          throw new Error('Project not found or access denied');
        }

        // Validate user has access to BOTH project AND organization
        const access = await validateProjectAccess(
          user.id,
          data.projectId,
          derivedOrgId
        );

        if (!access) {
          logger.warn('Project access validation failed in getScans', {
            userId: user.id,
            projectId: data.projectId,
            derivedOrgId,
          });
          throw new Error('Project not found or access denied');
        }

        organizationId = access.organization.id;
        validatedProjectId = access.project.id;

        logger.info('Validated projectId for scan listing', {
          projectId: data.projectId,
          organizationId,
          userId: user.id,
        });
      } else {
        // No projectId provided - use session organizationId
        organizationId = await getCurrentOrganizationId();
        logger.info("Fetching scan runs with artifacts from session", {
          organizationId,
        });
      }

      const scansWithArtifacts = await getScanRunsWithArtifacts(
        organizationId,
        validatedProjectId  // ✅ Only use validated projectId
      );

      logger.info("Retrieved scan runs", {
        organizationId,
        projectId: validatedProjectId,
        count: scansWithArtifacts.length,
      });

      return {
        success: true,
        data: scansWithArtifacts,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to fetch scan runs", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        data: [],
      };
    }
  });
