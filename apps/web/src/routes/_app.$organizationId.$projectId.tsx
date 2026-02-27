import {
  createFileRoute,
  Outlet,
  notFound,
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { createLogger } from "@repo/logger";
import { Button } from "@/components/ui/button";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { FullPageErrorState } from "@/components/shared/full-page-error-state";
import { OnboardingGuide } from "@/components/shared/onboarding-guide";
import type { ProjectRouteContext, OrganizationRouteContext } from "@/router";
import { isReservedProjectId } from "@/lib/reserved-ids";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

const logger = createLogger({ name: "project-layout" });

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
          : "The project you are looking for does not exist or you do not have access to it."
      }
    >
      <Button variant="outline" onClick={handleRetry}>
        Try Again
      </Button>
      <Link to="/$organizationId" params={{ organizationId }}>
        <Button variant="ghost">Back to Projects</Button>
      </Link>
    </FullPageErrorState>
  );
}

export const Route = createFileRoute("/_app/$organizationId/$projectId")({
  pendingComponent: PageLoadingFallback,
  errorComponent: ProjectErrorBoundary,
  beforeLoad: async ({ params, context }) => {
    if (isReservedProjectId(params.projectId)) {
      logger.warn("Attempted to access reserved project ID", {
        projectId: params.projectId,
      });
      throw notFound();
    }

    const { organization } = context as OrganizationRouteContext;

    // Use tRPC to fetch project
    const project = await context.queryClient.ensureQueryData(
      context.trpc.project.get.queryOptions({
        organizationId: organization.id,
        projectId: params.projectId,
      })
    );

    logger.info("Project layout loaded", {
      organizationId: organization.id,
      projectId: params.projectId,
      projectName: project.name,
    });

    return {
      project,
    } satisfies Pick<ProjectRouteContext, "project">;
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  return (
    <>
      <Outlet />
      <OnboardingGuide />
    </>
  );
}
