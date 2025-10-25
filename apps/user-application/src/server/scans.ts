import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getScanRunsWithArtifacts } from "@repo/data-ops";
import { getCurrentOrganizationId } from "./utils/auth";
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
      const organizationId = await getCurrentOrganizationId();
      logger.info("Fetching scan runs with artifacts", {
        organizationId,
        projectId: data?.projectId,
      });

      const scansWithArtifacts = await getScanRunsWithArtifacts(
        organizationId,
        data?.projectId
      );

      logger.info("Retrieved scan runs", {
        organizationId,
        projectId: data?.projectId,
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
