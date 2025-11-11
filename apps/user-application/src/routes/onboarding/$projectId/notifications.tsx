import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingNotifications } from "@/features/onboarding";
import { getOnboardingStatus, updateOnboardingStep } from "@/server/organization";
import { getNotificationPreferences } from "@/server/preferences";

export const Route = createFileRoute("/onboarding/$projectId/notifications")({
  // Guard: Require authentication before accessing step 4
  beforeLoad: async () => {
    const status = await getOnboardingStatus();

    // Redirect to step 1 if not authenticated
    if (!status.user) {
      console.log("[OnboardingNotifications] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  loader: async () => {
    console.log("[OnboardingNotifications] Loader executing");
    const status = await getOnboardingStatus();
    console.log("[OnboardingNotifications] Status fetched:", status);

    // Update max step reached to 4 (notifications)
    if (status.organizationId) {
      await updateOnboardingStep({
        data: {
          organizationId: status.organizationId,
          step: 4,
        },
      });
    }

    // Fetch existing notification preferences
    const preferencesResult = await getNotificationPreferences();
    const preferences = preferencesResult.success ? preferencesResult.data : undefined;

    return {
      onboarding: status,
      preferences,
    };
  },
  component: OnboardingNotificationsPage,
});

function OnboardingNotificationsPage() {
  const { projectId } = Route.useParams();
  const { onboarding, preferences } = Route.useLoaderData();

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
