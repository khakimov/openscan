import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { TableButtons } from "@/components/shared/data-table";
import { OverviewRange } from "@/features/overview";
import { DeviceDetailSheet } from "@/features/assets";
import { AlertTriangle, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { pushModal } from "@/modals";
import { useDevicesQuery } from "@/hooks/useDevicesQuery";

export const Route = createFileRoute("/_auth/assets")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "discovery",
    };
  },
  component: Assets,
});

function Assets() {
  const { tab } = Route.useSearch();

  // Map tab to verification status for server-side filtering
  // Discovery tab shows both CANDIDATE and EXCLUDED (all unverified devices)
  // Verified tab shows only VERIFIED devices
  const verificationStatus = tab === "verified" ? "VERIFIED" : (["CANDIDATE", "EXCLUDED"] as ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[]);

  const {
    data: devicesResponse,
    isLoading,
    error,
    isRefetching,
  } = useDevicesQuery({ verificationStatus });

  const handleDiscoveryCreated = (target: string) => {
    console.log('Discovery started for target:', target);
    // TODO: Implement actual discovery logic
  };

  // Handle loading state
  if (isLoading) {
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
          <Button
            onClick={() => {
              pushModal("AddDiscovery", { onConfirm: handleDiscoveryCreated });
            }}
          >
            <PlusIcon />
            <span className="max-sm:hidden">Start Discovery</span>
          </Button>
        </div>
        <TableButtons>
          <OverviewRange />
        </TableButtons>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Loader2 className="h-12 w-12 text-muted-foreground mb-4 animate-spin" />
          <h3 className="text-lg font-semibold mb-2">Loading devices...</h3>
        </div>
      </Padding>
    );
  }

  const hasDeviceData = devicesResponse?.items && Array.isArray(devicesResponse.items);
  // Server-side filtering via verificationStatus - no client-side filtering needed
  const devices = hasDeviceData ? devicesResponse.items : [];

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
        {isRefetching && (
          <div className="absolute top-4 right-4 z-10">
            <div className="flex items-center justify-center w-8 h-8 rounded border bg-background">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <TableButtons>
          <OverviewRange />
        </TableButtons>

        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to load devices</h3>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        ) : devices.length === 0 ? (
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
