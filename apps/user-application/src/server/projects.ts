import { createServerFn } from "@tanstack/react-start";
import { createLogger } from "@repo/logger";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { getProjectsForOrganization, createProject, getProjectById } from "@repo/data-ops";
import { getCurrentOrganizationId } from "./utils/auth";
import { getOrganizationById } from "./organization";

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
 * Validate project access and ownership (VULN-001 FIX)
 *
 * Security: Validates that:
 * 1. Project exists
 * 2. Project belongs to the specified organization
 * 3. User has access to the organization (via getCurrentOrganizationId)
 *
 * Used by route loaders to prevent unauthorized project access
 */
export const validateProjectAccess = createServerFn({
  method: "GET",
})
  .inputValidator((data: { projectId: string; organizationId: string }) => {
    if (!data?.projectId || !data?.organizationId) {
      throw new Error("Both projectId and organizationId are required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    try {
      // First, resolve organizationIdentifier (could be slug or ID) to actual organization
      // This validates user has access through getOrganizationById's membership check
      const orgResult = await getOrganizationById({
        data: data.organizationId
      });

      if (!orgResult.success || !orgResult.organization) {
        logger.warn("Organization not found or access denied", {
          requestedOrganization: data.organizationId,
          projectId: data.projectId,
        });
        return {
          success: false,
          error: "Project not found or access denied",
          project: null,
        };
      }

      const resolvedOrgId = orgResult.organization.id;

      // Verify this matches the user's current organization
      const userOrgId = await getCurrentOrganizationId();

      if (userOrgId !== resolvedOrgId) {
        logger.warn("User attempted to access project in different organization", {
          userOrganizationId: userOrgId,
          requestedOrganization: data.organizationId,
          resolvedOrganizationId: resolvedOrgId,
          projectId: data.projectId,
        });
        return {
          success: false,
          error: "Project not found or access denied",
          project: null,
        };
      }

      // Then validate project exists and belongs to organization
      const project = await getProjectById(data.projectId, resolvedOrgId);

      if (!project) {
        logger.warn("Project not found or does not belong to organization", {
          projectId: data.projectId,
          organizationId: resolvedOrgId,
        });
        return {
          success: false,
          error: "Project not found or access denied",
          project: null,
        };
      }

      logger.info("Project access validated", {
        projectId: project.id,
        projectName: project.name,
        organizationId: resolvedOrgId,
        organizationSlug: orgResult.organization.slug,
      });

      return {
        success: true,
        project,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to validate project access", {
        error: errorMessage,
        projectId: data.projectId,
        organizationIdentifier: data.organizationId,
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
