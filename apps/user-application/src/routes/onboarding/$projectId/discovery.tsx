import { createFileRoute } from "@tanstack/react-router";
import { OnboardingLayout, OnboardingDiscovery } from "@/features/onboarding";
import { getOnboardingStatus } from "@/server/organization";
import { getDiscoveryDevices } from "@/server/devices";

type DiscoverySearch = {
  domain?: string;
};

export const Route = createFileRoute("/onboarding/$projectId/discovery")({
  validateSearch: (search: Record<string, unknown>): DiscoverySearch => {
    return {
      domain: typeof search.domain === "string" ? search.domain : undefined,
    };
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
