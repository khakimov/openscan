import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";

export const Route = createFileRoute("/_app/$organizationId/$projectId/")({
  component: ProjectDashboard,
});

function ProjectDashboard() {
  const { user } = Route.useRouteContext();
  const { projectId } = Route.useParams();

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
      <p className="text-xs text-muted-foreground mt-2">Project: {projectId}</p>
    </Padding>
  );
}
