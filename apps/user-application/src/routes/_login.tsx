import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/server/auth";
import { LoginLeftPanel } from "@/components/login/login-left-panel";

export const Route = createFileRoute("/_login")({
  beforeLoad: async () => {
    // Redirect authenticated users to onboarding
    const user = await getCurrentUser().catch(() => null);
    if (user) {
      throw redirect({ to: "/onboarding" });
    }
  },
  component: LoginLayout,
});

function LoginLayout() {
  return (
    <div className="relative min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left Panel - Desktop Only */}
      <div className="hidden md:flex items-center justify-center">
        <LoginLeftPanel />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex items-center justify-center w-full px-4 py-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
