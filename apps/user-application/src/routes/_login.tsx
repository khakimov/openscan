import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUser } from "@/server/auth";
import { getOnboardingStatus, getActiveOrganization } from "@/server/organization";
import { getOrCreateDefaultProject } from "@repo/data-ops";
import { LoginLeftPanel } from "@/components/login/login-left-panel";

export const Route = createFileRoute("/_login")({
  beforeLoad: async () => {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
      return;
    }

    const onboarding = await getOnboardingStatus().catch(() => null);

    // Debug: Log what we got from getOnboardingStatus
    console.log('[_login] Onboarding status:', {
      success: onboarding?.success,
      onboardingCompleted: onboarding?.onboardingCompleted,
      organizationId: onboarding?.organizationId,
      projectId: onboarding?.projectId,
    });

    if (
      onboarding &&
      onboarding.success &&
      onboarding.onboardingCompleted &&
      onboarding.organizationId
    ) {
      const activeOrgResult = await getActiveOrganization().catch(() => null);

      const organizationIdentifier =
        activeOrgResult?.success && activeOrgResult.organization
          ? activeOrgResult.organization.slug || activeOrgResult.organization.id
          : onboarding.organizationId;

      let projectId =
        onboarding.project?.id ??
        onboarding.projectId ??
        null;

      if (!projectId) {
        const defaultProject = await getOrCreateDefaultProject(
          onboarding.organizationId,
        ).catch(() => null);
        projectId = defaultProject?.id ?? null;
      }

      if (organizationIdentifier && projectId) {
        throw redirect({
          to: "/$organizationId/$projectId",
          params: {
            organizationId: organizationIdentifier,
            projectId,
          },
        });
      }
    }

    // Fall back to onboarding flow if not completed or information missing
    throw redirect({ to: "/onboarding" });
  },
  component: LoginLayout,
});

function LoginLayout() {
  return (
    <div className="relative min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left Panel - Desktop Only */}
      <div className="hidden md:flex items-center justify-center">
        <LoginLeftPanel />
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex items-center justify-center w-full px-4 py-12">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
