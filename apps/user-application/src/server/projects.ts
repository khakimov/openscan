import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { getProjectsForOrganization, createProject } from "@repo/data-ops";
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

/**
 * Create a new project for the current organization
 */
const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Project name is too long"),
  description: z.string().optional(),
  domain: z.string().optional(),
});

export const createProjectData = createServerFn({
  method: "POST",
})
  .inputValidator(zodValidator(createProjectSchema))
  .handler(async ({ data }) => {
    try {
      const organizationId = await getCurrentOrganizationId();

      const project = await createProject(organizationId, {
        name: data.name,
        description: data.description,
        domain: data.domain,
      });

      logger.info("Project created", {
        organizationId,
        projectId: project.id,
        projectName: project.name,
      });

      return {
        success: true,
        project,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create project", { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  });
