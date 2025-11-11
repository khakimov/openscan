import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingWelcome } from "@/features/onboarding";

const parentRoute = getRouteApi("/onboarding");

export const Route = createFileRoute("/onboarding/")({
  // No loader needed - inherit parent's onboarding data
  component: OnboardingIndex,
});

function OnboardingIndex() {
  // Access parent route's loader data
  const { onboarding } = parentRoute.useLoaderData();

  return (
    <OnboardingLayout
      currentStep={1}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
      isAuthenticated={!!onboarding.user}
    >
      <OnboardingWelcome onboarding={onboarding} />
    </OnboardingLayout>
  );
}
