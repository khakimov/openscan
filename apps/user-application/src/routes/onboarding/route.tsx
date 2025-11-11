import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/server/auth";
import { getOnboardingStatus } from "@/server/organization";
import { getOrCreateDefaultProject } from "@repo/data-ops";

export const Route = createFileRoute("/onboarding")({
  // Centralized loader: fetch onboarding status ONCE for all child routes
  loader: async () => {
    const user = await getCurrentUser().catch(() => null);

    // If no user, return minimal status for signup flow
    if (!user) {
      return {
        onboarding: {
          success: true,
          step: 1,
          organizationId: null,
          projectId: null,
          user: null,
          organizations: [],
          onboardingCompleted: false,
        },
      };
    }

    // Fetch onboarding status once - child routes will inherit this
    const status = await getOnboardingStatus();

    // Redirect completed users to dashboard
    if (status.onboardingCompleted && status.organizationId) {
      const defaultProject = await getOrCreateDefaultProject(status.organizationId);

      throw redirect({
        to: "/$organizationId/$projectId",
        params: {
          organizationId: status.organizationId,
          projectId: defaultProject.id,
        },
      });
    }

    return { onboarding: status };
  },
  component: OnboardingRouteLayout,
});

function OnboardingRouteLayout() {
  return <Outlet />;
}
