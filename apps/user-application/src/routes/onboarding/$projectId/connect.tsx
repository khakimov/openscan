import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingConnect, OnboardingLayout } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/onboarding/$projectId/connect")({
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
  component: OnboardingConnectPage,
});

function OnboardingConnectPage() {
  const { onboarding } = Route.useLoaderData();
  const { projectId } = Route.useParams();

  return (
    <OnboardingLayout
      currentStep={4}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
    >
      <OnboardingConnect projectId={projectId} />
    </OnboardingLayout>
  );
}
