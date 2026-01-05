import { createFileRoute, Outlet, notFound, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { createLogger } from "@repo/logger";
import { ProjectGate } from "@/components/layout/project-gate";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { FullPageErrorState } from "@/components/shared/full-page-error-state";
import { getProject } from "@/server/project";

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

/**
 * Error boundary for project loader failures
 * Handles project not found, access denied, etc.
 */
function ProjectErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { reset: resetQuery } = useQueryErrorResetBoundary();
  const { organizationId } = Route.useParams();

  const handleRetry = () => {
    resetQuery();
    router.invalidate();
    reset();
  };

  return (
    <FullPageErrorState
      title="Project Not Found"
      description={
        error instanceof Error
          ? error.message
          : 'The project you are looking for does not exist or you do not have access to it.'
      }
    >
      <Button variant="outline" onClick={handleRetry}>
        Try Again
      </Button>
      <Link to="/$organizationId" params={{ organizationId }}>
        <Button variant="ghost">
          Back to Projects
        </Button>
      </Link>
    </FullPageErrorState>
  );
}

export const Route = createFileRoute("/_app/$organizationId/$projectId")({
  pendingComponent: ProjectPendingShell,
  errorComponent: ProjectErrorBoundary,
  beforeLoad: async ({ params, context }) => {
    // Block reserved project IDs (these are org-level routes)
    if (RESERVED_PROJECT_IDS.includes(params.projectId)) {
      logger.warn("Attempted to access reserved project ID", {
        projectId: params.projectId
      });
      throw notFound();
    }

    const { projectId } = params;

    // ✅ Get organization from parent context (set by organization route's beforeLoad)
    const { organization } = context as { organization: { id: string; slug?: string | null } };

    // ✅ Fetch project with validated org ID
    const project = await getProject({
      data: {
        organizationId: organization.id,
        projectId,
      }
    });

    logger.info("Project layout loaded", {
      organizationId: organization.id,
      projectId,
      projectName: project.name,
    });

    // ✅ Return organization and project in context for child routes
    return {
      organization,
      project,
    };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  // ✅ Get project from beforeLoad context (organization also available to children)
  const { project } = Route.useRouteContext();

  return (
    <ProjectGate project={project}>
      <Outlet />
    </ProjectGate>
  );
}
