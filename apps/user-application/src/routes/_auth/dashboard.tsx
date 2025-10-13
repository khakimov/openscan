import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";

export const Route = createFileRoute("/_auth/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();

  return (
    <Padding>
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.email || "User"}!
        </p>
      </div>
    </Padding>
  );
}
