import { createFileRoute } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingWelcome } from "@/features/onboarding";

export const Route = createFileRoute("/onboarding/")({
  // No loader needed - inherit parent's onboarding data
  component: OnboardingIndex,
});

function OnboardingIndex() {
  // Access parent route's loader data
  const parentData = Route.useRouteContext({
    from: "/onboarding",
    select: (data) => data.onboarding,
  });

  return (
    <OnboardingLayout
      currentStep={1}
      maxStep={parentData.step}
      projectId={parentData.projectId}
      isAuthenticated={!!parentData.user}
    >
      <OnboardingWelcome onboarding={parentData} />
    </OnboardingLayout>
  );
}
