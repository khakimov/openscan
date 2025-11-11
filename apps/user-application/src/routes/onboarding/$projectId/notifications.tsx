import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingNotifications } from "@/features/onboarding";
import { updateOnboardingStep } from "@/server/organization";
import { getNotificationPreferences } from "@/server/preferences";

export const Route = createFileRoute("/onboarding/$projectId/notifications")({
  // Guard: Require authentication before accessing step 4
  beforeLoad: async ({ context }) => {
    const onboarding = context.onboarding;

    // Redirect to step 1 if not authenticated
    if (!onboarding.user) {
      console.log("[OnboardingNotifications] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  // Lightweight loader - only fetch preferences, not onboarding status
  loader: async ({ context }) => {
    console.log("[OnboardingNotifications] Loader executing");
    const onboarding = context.onboarding;

    // Update max step reached to 4 (notifications)
    if (onboarding.organizationId) {
      await updateOnboardingStep({
        data: {
          organizationId: onboarding.organizationId,
          step: 4,
        },
      });
    }

    // Fetch existing notification preferences
    const preferencesResult = await getNotificationPreferences();
    const preferences = preferencesResult.success ? preferencesResult.data : undefined;

    return {
      preferences,
    };
  },
  component: OnboardingNotificationsPage,
});

function OnboardingNotificationsPage() {
  const { projectId } = Route.useParams();
  const { preferences } = Route.useLoaderData();
  const onboarding = Route.useRouteContext({
    from: "/onboarding",
    select: (data) => data.onboarding,
  });

  console.log("[OnboardingNotificationsPage] Rendering with:", {
    projectId,
    organizationId: onboarding.organizationId,
  });

  return (
    <OnboardingLayout
      currentStep={4}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
      isAuthenticated={true}
    >
      <OnboardingNotifications
        projectId={projectId}
        organizationId={onboarding.organizationId}
        initialValues={preferences}
      />
    </OnboardingLayout>
  );
}
