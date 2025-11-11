import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingCreateProject } from "@/features/onboarding";

const parentRoute = getRouteApi("/onboarding");

export const Route = createFileRoute("/onboarding/project")({
  // Loader runs after parent, so parent data is available in context
  loader: async ({ context }) => {
    console.log("[OnboardingProject] Loader executing");

    // Parent loader puts onboarding in context
    const onboarding = (context as any).onboarding;

    // Guard: Redirect if not authenticated
    if (!onboarding?.user) {
      console.log("[OnboardingProject] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }

    const organizations = onboarding.organizations ?? [];
    const organizationRecord = onboarding.organization;
    const projectRecord = onboarding.project;

    const metadata = (organizationRecord?.metadata ?? null) as Record<string, unknown> | null;
    const timezone =
      metadata && typeof metadata["timezone"] === "string"
        ? (metadata["timezone"] as string)
        : undefined;

    const initialForm = {
      organizationName: organizationRecord?.name ?? "",
      timezone,
      projectName: projectRecord?.name ?? "",
      domain: projectRecord?.domain ?? "",
    };

    return {
      hasOrganization: organizations.length > 0,
      initialForm,
    };
  },
  component: OnboardingProjectPage,
});

function OnboardingProjectPage() {
  const { hasOrganization, initialForm } = Route.useLoaderData();
  const { onboarding } = parentRoute.useLoaderData();

  console.log("[OnboardingProjectPage] Rendering with:", {
    hasOrganization,
  });

  return (
    <OnboardingLayout
      currentStep={2}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
      isAuthenticated={true}
    >
      <OnboardingCreateProject
        hasOrganization={hasOrganization}
        organizationId={onboarding.organizationId}
        projectId={onboarding.projectId}
        initialValues={initialForm}
      />
    </OnboardingLayout>
  );
}
