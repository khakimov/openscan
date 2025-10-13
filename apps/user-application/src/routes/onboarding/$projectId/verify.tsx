import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingVerify } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/onboarding/$projectId/verify")({
  loader: async ({ params }) => {
    const status = await getOnboardingStatus();

    if (status.step < 2) {
      throw redirect({ to: "/onboarding" });
    }

    const fallbackProjectId = status.projectId ?? params.projectId ?? null;

    if (status.step < 3 || !fallbackProjectId) {
      throw redirect({ to: "/onboarding/project" });
    }

    const activeProjectId = params.projectId ?? fallbackProjectId;

    return {
      onboarding: {
        ...status,
        projectId: activeProjectId,
      },
    };
  },
  component: OnboardingVerifyPage,
});

function OnboardingVerifyPage() {
  const { onboarding } = Route.useLoaderData();
  const { projectId } = Route.useParams();

  return (
    <OnboardingLayout
      currentStep={5}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
    >
      <OnboardingVerify projectId={projectId} />
    </OnboardingLayout>
  );
}
