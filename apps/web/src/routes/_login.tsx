import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { LoginLeftPanel } from "@/components/login/login-left-panel";

export const Route = createFileRoute("/_login")({
  beforeLoad: async ({ context }) => {
    // Session already fetched by __root.tsx (fetchSession server function - no HTTP during SSR)
    // If user is authenticated, redirect to home (let index.tsx handle routing)
    if (context.session?.session) {
      throw redirect({ to: "/" });
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
