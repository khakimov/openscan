import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs } from "@/components/navigation/page-tabs";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";

export const Route = createFileRoute("/_auth/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();

  return (
    <Padding>
      <div className="mb-4 flex items-center gap-3">
        <PageTabs>
          <div className="flex items-center gap-2 px-4 py-2">
            <span className="text-lg font-medium">Dashboard</span>
            {/* Hidden on mobile (shows in sidebar instead) */}
            <InlineRouterSpinner className="hidden lg:inline-flex" />
          </div>
        </PageTabs>
      </div>
      <p className="text-muted-foreground">
        Welcome back, {user?.name || "User"}!
      </p>
    </Padding>
  );
}
