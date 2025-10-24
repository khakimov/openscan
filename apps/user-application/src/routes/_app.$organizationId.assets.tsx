import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { TableButtons } from "@/components/shared/data-table";
import { OverviewRange } from "@/features/overview";
import { DeviceDetailSheet } from "@/features/assets";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { pushModal } from "@/modals";
import { deviceQueries } from "@/queries/device-queries";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";

// Search params schema with proper validation
const assetsSearchSchema = z.object({
  tab: fallback(z.enum(["discovery", "verified"]), "discovery").default("discovery"),
});

export const Route = createFileRoute("/_app/$organizationId/assets")({
  validateSearch: zodValidator(assetsSearchSchema),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context: { queryClient }, deps: { tab } }) => {
    // Map tab to verification status from validated search params
    const verificationStatus =
      tab === "verified"
        ? "VERIFIED"
        : (["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[]);

    // Populate query cache using queryOptions
    // This ensures SSR data is available in cache for useSuspenseQuery
    return queryClient.ensureQueryData(
      deviceQueries.list({ verificationStatus })
    );
  },
  // No pendingComponent - render page shell immediately, suspend only data component
  component: Assets,
});

function Assets() {
  const { tab } = Route.useSearch();
  const { organizationId } = Route.useParams();

  // Track newly added device IDs for animation (TanStack pattern - UI state in component)
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const handleDiscoveryCreated = (target: string) => {
    console.log('Discovery started for target:', target);
  };

  // Callback when devices are added - triggers animation
  const handleDevicesAdded = (deviceIds: string[]) => {
    setNewlyAddedIds(new Set(deviceIds));

    // Clear animation after 3 seconds
    setTimeout(() => {
      setNewlyAddedIds(new Set());
    }, 3000);
  };

  return (
    <Padding>
      {/* Page shell - renders immediately, no data needed */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageTabs>
            <PageTabsLink href={`/${organizationId}/assets?tab=discovery`} isActive={tab === "discovery"}>
              Discovery
            </PageTabsLink>
            <PageTabsLink href={`/${organizationId}/assets?tab=verified`} isActive={tab === "verified"}>
              Verified
            </PageTabsLink>
          </PageTabs>
          {/* Hidden on mobile (shows in sidebar instead) */}
          <InlineRouterSpinner className="hidden lg:inline-flex" />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              pushModal("AddDevice", {});
            }}
          >
            <PlusIcon />
            <span className="max-sm:hidden">Add Device</span>
          </Button>
          <Button
            onClick={() => {
              pushModal("AddDiscovery", {
                onConfirm: handleDiscoveryCreated,
                onDevicesAdded: handleDevicesAdded,
              });
            }}
          >
            <PlusIcon />
            <span className="max-sm:hidden">Start Discovery</span>
          </Button>
        </div>
      </div>

      {/* Data component - only this suspends, page shell stays visible */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        }
      >
        <DevicesContent tab={tab} newlyAddedIds={newlyAddedIds} />
      </Suspense>
    </Padding>
  );
}

// Data-dependent component - suspends during loading
function DevicesContent({
  tab,
  newlyAddedIds
}: {
  tab: "discovery" | "verified";
  newlyAddedIds: Set<string>;
}) {
  // Map tab to verification status for query
  const verificationStatus =
    tab === "verified"
      ? "VERIFIED"
      : (["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[]);

  // Use suspense query with same queryOptions as loader
  // Data is guaranteed to exist (populated by loader)
  const { data: devicesResponse } = useSuspenseQuery(
    deviceQueries.list({ verificationStatus })
  );

  // No nullability check needed - useSuspenseQuery guarantees data exists
  const devices = devicesResponse.items;

  return (
    <div className="relative">
      <TableButtons>
        <OverviewRange />
      </TableButtons>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {tab === "verified" ? "No verified devices" : "No discovered devices"}
          </h3>
          <p className="text-muted-foreground">
            {tab === "verified"
              ? "Manually added or verified devices will appear here."
              : "Devices will appear here once they are discovered by the scanner."}
          </p>
        </div>
      ) : (
        <DeviceDetailSheet devices={devices} newlyAddedIds={newlyAddedIds} />
      )}

      {devicesResponse && devicesResponse.totalPages > 1 && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Page {devicesResponse.page} of {devicesResponse.totalPages} (
          {devicesResponse.totalCount} total devices)
        </div>
      )}
    </div>
  );
}
