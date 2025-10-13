import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getScanRunsWithArtifacts } from "@repo/data-ops";
import { getCurrentTenant } from "./utils/auth";

const logger = createLogger({ name: "scans-server" });

/**
 * Get all scan runs with artifacts for the current tenant
 */
export const getScans = createServerFn({
  method: "GET",
}).handler(async ({ request }) => {
  try {
    const tenantId = await getCurrentTenant();
    logger.info("Fetching scan runs with artifacts", { tenantId });

    const scansWithArtifacts = await getScanRunsWithArtifacts(tenantId);

    logger.info("Retrieved scan runs", {
      tenantId,
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
