import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { useProject } from "@/components/layout";

/**
 * Pending component for project dashboard
 * Uses compact inline spinner to keep tabs visible
 */
const ProjectDashboardPending = () => (
  <Padding>
    <div className="flex items-center mb-4">
      <PageTabs>
        <PageTabsLink to="." isActive={true}>
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
  const { user } = Route.useRouteContext();
  const project = useProject();

  return (
    <Padding>
      <div className="flex items-center mb-4">
        <PageTabs>
          <PageTabsLink to="." isActive={true}>
            Dashboard
          </PageTabsLink>
        </PageTabs>
      </div>
      <p className="text-muted-foreground">
        Welcome back, {user?.name || "User"}!
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Project: {project.name || project.id}
      </p>
    </Padding>
  );
}
