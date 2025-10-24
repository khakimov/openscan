import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/server/auth";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const user = await getCurrentUser();

    // If no user, allow access to onboarding for signup
    if (!user) {
      return;
    }

    // Check if user has already completed onboarding
    const status = await getOnboardingStatus();
    if (status.onboardingCompleted && status.organizationId) {
      // Redirect completed users to organization dashboard
      throw redirect({ to: `/${status.organizationId}` as any });
    }

    // Allow users to continue through onboarding flow
  },
  component: OnboardingRouteLayout,
});

function OnboardingRouteLayout() {
  return <Outlet />;
}
