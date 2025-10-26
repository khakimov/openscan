import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { createLogger } from "@repo/logger";
import { validateProjectAccess } from "@/server/projects";

const logger = createLogger({ name: "project-layout" });

// Reserved project IDs that cannot be used (like organization IDs)
const RESERVED_PROJECT_IDS = [
  'settings',      // Organization settings
  'members',       // Organization members
  'billing',       // Organization billing
  'integrations',  // Organization integrations
];

/**
 * Project layout route - validates project access and loads project data
 *
 * URL structure: /:organizationId/:projectId
 * Example: /acme-corp/proj_abc123
 *
 * This layout:
 * - Validates project exists and belongs to organization
 * - Validates user has access to project
 * - Loads project data for child routes
 * - Blocks reserved project IDs
 */
export const Route = createFileRoute("/_app/$organizationId/$projectId")({
  beforeLoad: async ({ params }) => {
    // Block reserved project IDs (these are org-level routes)
    if (RESERVED_PROJECT_IDS.includes(params.projectId)) {
      logger.warn("Attempted to access reserved project ID", {
        projectId: params.projectId
      });
      throw notFound();
    }
  },
  loader: async ({ params }) => {
    // VULN-001 FIX: Validate project exists and belongs to organization
    const result = await validateProjectAccess({
      data: {
        projectId: params.projectId,
        organizationId: params.organizationId,
      },
    });

    if (!result.success || !result.project) {
      logger.warn("Project access denied", {
        organizationId: params.organizationId,
        projectId: params.projectId,
        error: result.error,
      });
      throw notFound();
    }

    logger.info("Project layout loaded", {
      organizationId: params.organizationId,
      projectId: params.projectId,
      projectName: result.project.name,
    });

    return {
      projectId: params.projectId,
      project: result.project,
    };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  return <Outlet />;
}
