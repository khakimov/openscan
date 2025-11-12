import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { getProjectsForOrganization, createProject, validateProjectAccess } from "@repo/data-ops";
import { getCurrentOrganizationId, getCurrentUser } from "./utils/auth";
import type { ProjectsListResult, ProjectAccessResult, ProjectCreateResult } from "./projects/types";

const logger = createLogger({ name: "projects-server" });

/**
 * Get all projects for the current organization
 */
export const getOrganizationProjects = createServerFn({
  method: "GET",
}).handler(async (): Promise<ProjectsListResult> => {
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
 * Validate project access and ownership (VULN-001 FIX - REFACTORED)
 *
 * Security: Validates that:
 * 1. Project exists
 * 2. Project belongs to the specified organization
 * 3. User has access to the organization (via membership check)
 *
 * Now just a thin wrapper around data-ops validateProjectAccess function.
 * All business logic lives in data-ops for better reusability.
 */
export const validateProjectAccessFn = createServerFn({
  method: "GET",
})
  .inputValidator((data: { projectId: string; organizationId: string }) => {
    if (!data?.projectId || !data?.organizationId) {
      throw new Error("Both projectId and organizationId are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ProjectAccessResult> => {
    try {
      const user = await getCurrentUser();

      // ✅ CLEAN: All business logic in data-ops
      const result = await validateProjectAccess(
        user.id,
        data.projectId,
        data.organizationId
      );

      if (!result) {
        logger.warn("Project access denied", {
          userId: user.id,
          organizationId: data.organizationId,
          projectId: data.projectId,
        });
        return {
          success: false,
          error: "Project not found or access denied",
          project: null,
        };
      }

      logger.info("Project access validated", {
        userId: user.id,
        projectId: result.project.id,
        projectName: result.project.name,
        organizationId: result.organization.id,
        organizationSlug: result.organization.slug,
      });

      return {
        success: true,
        project: result.project,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to validate project access", {
        error: errorMessage,
        projectId: data.projectId,
        organizationId: data.organizationId,
      });

      return {
        success: false,
        error: errorMessage,
        project: null,
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
  .handler(async ({ data }): Promise<ProjectCreateResult> => {
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
