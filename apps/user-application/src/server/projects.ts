import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { getProjectsForOrganization } from "@repo/data-ops";
import { getCurrentOrganizationId } from "./utils/auth";

const logger = createLogger({ name: "projects-server" });

/**
 * Get all projects for the current organization
 */
export const getOrganizationProjects = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const organizationId = await getCurrentOrganizationId();
    const projectsList = await getProjectsForOrganization(organizationId);

    logger.info("Projects fetched for organization", {
      organizationId,
      count: projectsList.length,
    });

    return {
      success: true,
      projects: projectsList,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch projects", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      projects: [],
    };
  }
});
