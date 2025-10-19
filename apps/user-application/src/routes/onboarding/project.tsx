import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingCreateProject } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";

export const Route = createFileRoute("/onboarding/project")({
  // Guard: Require authentication before accessing step 2
  beforeLoad: async () => {
    const status = await getOnboardingStatus();

    // Redirect to step 1 if not authenticated
    if (!status.user) {
      console.log("[OnboardingProject] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  // Fetch organization data in loader (authentication handled in server function)
  loader: async () => {
    console.log("[OnboardingProject] Loader executing");
    const status = await getOnboardingStatus();
    console.log("[OnboardingProject] Status fetched:", status);

    const organizations = status.organizations ?? [];
    const organizationRecord = status.organization;
    const projectRecord = status.project;

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
      onboarding: status,
      initialForm,
    };
  },
  component: OnboardingProjectPage,
});

function OnboardingProjectPage() {
  const { hasOrganization, onboarding, initialForm } = Route.useLoaderData();

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
