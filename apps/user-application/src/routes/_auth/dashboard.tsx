import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  return (
    <Padding>
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.name || "User"}!
        </p>
      </div>
    </Padding>
  );
}
