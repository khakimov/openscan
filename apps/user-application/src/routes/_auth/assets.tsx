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
import { deviceQueries } from "@/queries";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useSuspenseQuery } from "@tanstack/react-query";

// Search params schema with proper validation
const assetsSearchSchema = z.object({
  tab: fallback(z.enum(["discovery", "verified"]), "discovery").default("discovery"),
});

export const Route = createFileRoute("/_auth/assets")({
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
  component: Assets,
});

function Assets() {
  const { tab } = Route.useSearch();

  const handleDiscoveryCreated = (target: string) => {
    console.log('Discovery started for target:', target);
  };

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
    <Padding>
      <div className="mb-4 flex items-center justify-between">
        <PageTabs>
          <PageTabsLink href={"/assets?tab=discovery"} isActive={tab === "discovery"}>
            Discovery
          </PageTabsLink>
          <PageTabsLink href={"/assets?tab=verified"} isActive={tab === "verified"}>
            Verified
          </PageTabsLink>
        </PageTabs>
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
              pushModal("AddDiscovery", { onConfirm: handleDiscoveryCreated });
            }}
          >
            <PlusIcon />
            <span className="max-sm:hidden">Start Discovery</span>
          </Button>
        </div>
      </div>

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
          <DeviceDetailSheet devices={devices} />
        )}

        {devicesResponse && devicesResponse.totalPages > 1 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Page {devicesResponse.page} of {devicesResponse.totalPages} (
            {devicesResponse.totalCount} total devices)
          </div>
        )}
      </div>
    </Padding>
  );
}
