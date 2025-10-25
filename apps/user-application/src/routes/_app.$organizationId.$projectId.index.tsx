import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";

export const Route = createFileRoute("/_app/$organizationId/$projectId/")({
  component: ProjectDashboard,
});

function ProjectDashboard() {
  const { user } = Route.useRouteContext();
  const { projectId } = Route.useParams();

  return (
    <Padding>
      <div className="mb-4 flex items-center gap-3">
        <PageTabs>
          <PageTabsLink href={"?tab=all"} isActive={true}>
            Dashboard
          </PageTabsLink>
        </PageTabs>
        {/* Hidden on mobile (shows in sidebar instead) */}
        <InlineRouterSpinner className="hidden lg:inline-flex" />
      </div>
      <p className="text-muted-foreground">
        Welcome back, {user?.name || "User"}!
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Project: {projectId}
      </p>
    </Padding>
  );
}
