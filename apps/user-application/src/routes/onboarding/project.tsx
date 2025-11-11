import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingCreateProject } from "@/features/onboarding";

const parentRoute = getRouteApi("/onboarding");

export const Route = createFileRoute("/onboarding/project")({
  // Guard: Require authentication before accessing step 2
  beforeLoad: async () => {
    const { onboarding } = await parentRoute.loader();

    // Redirect to step 1 if not authenticated
    if (!onboarding.user) {
      console.log("[OnboardingProject] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  // Lightweight loader - just transform parent data
  loader: async () => {
    console.log("[OnboardingProject] Loader executing");
    const { onboarding } = await parentRoute.loader();

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
