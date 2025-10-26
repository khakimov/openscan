import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/server/auth";
import { getOnboardingStatus } from "@/server/organization";
import { getOrCreateDefaultProject } from "@repo/data-ops";

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
      // Get or create default project for the organization
      const defaultProject = await getOrCreateDefaultProject(status.organizationId);

      // Redirect completed users to project dashboard
      throw redirect({
        to: "/$organizationId/$projectId",
        params: {
          organizationId: status.organizationId,
          projectId: defaultProject.id,
        },
      });
    }

    // Allow users to continue through onboarding flow
  },
  component: OnboardingRouteLayout,
});

function OnboardingRouteLayout() {
  return <Outlet />;
}
