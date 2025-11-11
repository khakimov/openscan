import { createFileRoute, redirect, getRouteApi } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingDiscovery } from "@/features/onboarding";
import { getDiscoveryDevices } from "@/server/devices";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const parentRoute = getRouteApi("/onboarding");

// Search params schema with proper validation
const discoverySearchSchema = z.object({
  domain: z.string().optional(),
});

export const Route = createFileRoute("/onboarding/$projectId/discovery")({
  validateSearch: zodValidator(discoverySearchSchema),
  // Guard: Require authentication before accessing step 3
  beforeLoad: async () => {
    const { onboarding } = await parentRoute.loader();

    // Redirect to step 1 if not authenticated
    if (!onboarding.user) {
      console.log("[OnboardingDiscovery] No authenticated user, redirecting to step 1");
      throw redirect({ to: "/onboarding" });
    }
  },
  // Lightweight loader - only fetch devices, not onboarding status
  loader: async () => {
    console.log("[OnboardingDiscovery] Loader executing");
    const { onboarding } = await parentRoute.loader();

    // Extract saved domain from project
    const savedDomain = onboarding.project?.domain;

    // Fetch already-saved discovery devices
    const savedDevicesResult = await getDiscoveryDevices({
      data: { organizationId: onboarding.organizationId || undefined },
    });

    console.log("[OnboardingDiscovery] Saved devices fetched:", {
      count: savedDevicesResult.count,
      devices: savedDevicesResult.devices,
    });

    return {
      savedDomain,
      savedDevices: savedDevicesResult.devices || [],
    };
  },
  component: OnboardingDiscoveryPage,
});

function OnboardingDiscoveryPage() {
  const { projectId } = Route.useParams();
  const { domain: searchDomain } = Route.useSearch();
  const { savedDomain, savedDevices } = Route.useLoaderData();
  const { onboarding } = parentRoute.useLoaderData();

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
