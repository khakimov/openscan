import { createFileRoute, redirect } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingDiscovery } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";
import { getDiscoveryDevices } from "@/server/devices";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Loader2 } from "lucide-react";

// Search params schema with proper validation
const discoverySearchSchema = z.object({
  domain: z.string().optional(),
});

export const Route = createFileRoute("/onboarding/$projectId/discovery")({
  validateSearch: zodValidator(discoverySearchSchema),
  // Guard: Require authentication before accessing step 3
  beforeLoad: async () => {
    const status = await getOnboardingStatus();

    // Redirect to step 1 if not authenticated
    if (!status.user) {
      console.log("[OnboardingDiscovery] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  loader: async () => {
    console.log("[OnboardingDiscovery] Loader executing");
    const status = await getOnboardingStatus();
    console.log("[OnboardingDiscovery] Status fetched:", status);

    // Extract saved domain from project
    const savedDomain = status.project?.domain;

    // Fetch already-saved discovery devices
    const savedDevicesResult = await getDiscoveryDevices({
      data: { organizationId: status.organizationId || undefined },
    });

    console.log("[OnboardingDiscovery] Saved devices fetched:", {
      count: savedDevicesResult.count,
      devices: savedDevicesResult.devices,
    });

    return {
      onboarding: status,
      savedDomain,
      savedDevices: savedDevicesResult.devices || [],
    };
  },
  pendingComponent: () => (
    <OnboardingLayout currentStep={3} isAuthenticated={true}>
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </OnboardingLayout>
  ),
  component: OnboardingDiscoveryPage,
});

function OnboardingDiscoveryPage() {
  const { projectId } = Route.useParams();
  const { domain: searchDomain } = Route.useSearch();
  const { onboarding, savedDomain, savedDevices } = Route.useLoaderData();

  // Use search param domain if provided, otherwise use saved domain
  // Both can be undefined, which is fine - component will show empty input
  const domain = searchDomain || savedDomain || undefined;

  console.log("[OnboardingDiscoveryPage] Rendering with:", {
    projectId,
    searchDomain,
    savedDomain,
    domain,
    savedDevicesCount: savedDevices.length,
  });

  return (
    <OnboardingLayout
      currentStep={3}
      maxStep={onboarding.step}
      projectId={onboarding.projectId}
      isAuthenticated={true}
    >
      <OnboardingDiscovery
        projectId={projectId}
        organizationId={onboarding.organizationId}
        domain={domain}
        savedDevices={savedDevices}
      />
    </OnboardingLayout>
  );
}
