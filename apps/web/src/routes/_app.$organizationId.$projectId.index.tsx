import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import type { ProjectRouteContext } from "@/router";

/**
 * Pending component — preserves tabs while parent's beforeLoad resolves
 */
const ProjectDashboardPending = () => (
  <Padding>
    <div className="flex items-center mb-4">
      <PageTabs>
        <PageTabsLink to=".">
          Dashboard
        </PageTabsLink>
      </PageTabs>
    </div>
    <PageLoadingFallback compact />
  </Padding>
);

export const Route = createFileRoute("/_app/$organizationId/$projectId/")({
  pendingComponent: ProjectDashboardPending,
  component: ProjectDashboard,
});

function ProjectDashboard() {
  // ✅ Get project from parent route context (via beforeLoad)
  const { project } = Route.useRouteContext() as ProjectRouteContext;

  return (
    <Padding>
      <div className="flex items-center mb-4">
        <PageTabs>
          <PageTabsLink to=".">
            Dashboard
          </PageTabsLink>
        </PageTabs>
      </div>
      <p className="text-muted-foreground">
        Welcome to your project dashboard
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Project: {project.name || project.id}
      </p>
    </Padding>
  );
}
