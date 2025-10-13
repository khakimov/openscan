import { createFileRoute } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingWelcome } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/onboarding/")({
  loader: async () => {
    const status = await getOnboardingStatus();

    return { onboarding: status };
  },
  component: OnboardingIndex,
});

function OnboardingIndex() {
  const { onboarding } = Route.useLoaderData();
  return (
    <OnboardingLayout
      currentStep={1}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
    >
      <OnboardingWelcome onboarding={onboarding} />
    </OnboardingLayout>
  );
}
