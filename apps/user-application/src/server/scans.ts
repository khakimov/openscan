import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getScanRunsWithArtifacts } from "@repo/data-ops";
import { getCurrentOrganizationId } from "./utils/auth";

const logger = createLogger({ name: "scans-server" });

/**
 * Get all scan runs with artifacts for the current organization
 */
export const getScans = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const organizationId = await getCurrentOrganizationId();
    logger.info("Fetching scan runs with artifacts", { organizationId });

    const scansWithArtifacts = await getScanRunsWithArtifacts(organizationId);

    logger.info("Retrieved scan runs", {
      organizationId,
      count: scansWithArtifacts.length,
    });

    return {
      success: true,
      data: scansWithArtifacts,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch scan runs", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      data: [],
    };
  }
});
