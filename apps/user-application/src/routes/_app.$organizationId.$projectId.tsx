import { createFileRoute, Outlet, notFound, type ErrorComponentProps } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { createLogger } from "@repo/logger";
import { ProjectGate } from "@/components/layout/project-gate";
import { Spinner } from "@/components/ui/spinner";
import { ErrorLayout } from "@/components/error-layout";

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

type ProjectRouteError = {
  status: number;
  message: string;
  code?: string;
};

const toProjectRouteError = (error: unknown): ProjectRouteError => {
  // Handle tRPC errors first (preserves accurate status codes)
  if (error instanceof TRPCClientError) {
    const status = error.data?.httpStatus ?? 500;
    return {
      status,
      message: error.message,
      code: error.data?.code,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof (error as any).status === "number" &&
    typeof (error as any).message === "string"
  ) {
    return {
      status: (error as any).status,
      message: (error as any).message,
      code:
        "code" in error && typeof (error as any).code === "string"
          ? (error as any).code
          : undefined,
    };
  }

  if (typeof error === "object" && error !== null) {
    const statusCode =
      "statusCode" in error && typeof (error as any).statusCode === "number"
        ? (error as any).statusCode
        : undefined;
    const message =
      "message" in error && typeof (error as any).message === "string"
        ? (error as any).message
        : undefined;
    const code =
      "code" in error && typeof (error as any).code === "string"
        ? String((error as any).code)
        : undefined;

    if (statusCode) {
      return {
        status: statusCode,
        message: message ?? "Unexpected error while resolving project",
        code,
      };
    }
  }

  return {
    status: 500,
    message:
      error instanceof Error
        ? error.message
        : "Unexpected error while resolving project",
    code: "PROJECT_UNKNOWN_ERROR",
  };
};

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
  loader: async ({ params, context }) => {
    const { organizationId: orgParam, projectId } = params;

    try {
      // Get organization from parent loader to resolve slug → ID
      const orgData = await context.queryClient.ensureQueryData(
        context.trpc.organization.get.queryOptions({
          organizationId: orgParam,
        })
      );

      // Use real organization ID (not slug) for project queries
      const organizationId = orgData.id;

      // OpenPanel pattern: Use tRPC queryOptions for loader queries
      const accessQuery = context.trpc.project.get.queryOptions({
        organizationId,
        projectId,
      });
      const project = await context.queryClient.fetchQuery(accessQuery);

      // Prefetch projects for sidebar
      const projectsQuery = context.trpc.project.listByOrg.queryOptions({
        organizationId,
      });
      await context.queryClient.prefetchQuery(projectsQuery);

      logger.info("Project layout loaded", {
        organizationId,
        projectId,
        projectName: project.name,
      });

      return {
        projectId,
        project,
      };
    } catch (error) {
      throw toProjectRouteError(error);
    }
  },
  errorComponent: ProjectError,
  component: ProjectLayout,
});

function ProjectError({ error }: ErrorComponentProps) {
  const payload = toProjectRouteError(error);
  const status = payload.status;
  const code = payload.code;
  const message = payload.message;
  const is403 = status === 403;

  return (
    <ErrorLayout
      status={status}
      title={is403 ? "Access Denied" : "Project Not Found"}
      message={
        is403
          ? "You don't have access to this project."
          : message
      }
      technicalDetails={
        code ? (
          <dl className="text-sm text-muted-foreground">
            <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
              <dt className="font-semibold">Error code</dt>
              <dd>{code}</dd>
            </div>
          </dl>
        ) : null
      }
      actions={[
        { label: "Go Home", to: "/", variant: "default" },
        {
          label: "Go Back",
          onClick: () => window.history.back(),
          variant: "outline",
        },
      ]}
    />
  );
}

function ProjectLayout() {
  const { project } = Route.useLoaderData();

  return (
    <ProjectGate project={project}>
      <Outlet />
    </ProjectGate>
  );
}
