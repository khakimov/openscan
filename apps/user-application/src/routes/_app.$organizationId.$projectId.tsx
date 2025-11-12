import { createFileRoute, Outlet, notFound } from "@tanstack/react-router";
import { createLogger } from "@repo/logger";
import { validateProjectAccessFn } from "@/server/projects";
import { Spinner } from "@/components/ui/spinner";

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

/**
 * Pending shell for project route
 * Shows centered spinner while project loader validates access
 * Keeps parent layouts (_app, organization) mounted
 */
const ProjectPendingShell = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Spinner size="md" wait="delay-200" />
  </div>
);

export const Route = createFileRoute("/_app/$organizationId/$projectId")({
  pendingComponent: ProjectPendingShell,
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
    const result = await validateProjectAccessFn({
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
