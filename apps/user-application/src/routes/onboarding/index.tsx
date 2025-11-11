import { createFileRoute } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingWelcome } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/onboarding/")({
  loader: async () => {
    const status = await getOnboardingStatus();

    return { onboarding: status };
  },
  pendingComponent: () => (
    <OnboardingLayout currentStep={1} isAuthenticated={false}>
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </OnboardingLayout>
  ),
  component: OnboardingIndex,
});

function OnboardingIndex() {
  const { onboarding } = Route.useLoaderData();
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
