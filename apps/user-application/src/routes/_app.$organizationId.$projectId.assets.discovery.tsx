import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { TableButtons } from "@/components/shared/data-table";
import { OverviewRange } from "@/features/overview";
import { DeviceDetailSheet } from "@/features/assets";
import { Shield } from "lucide-react";
import { pushModal } from "@/modals";
import { deviceQueries } from "@/queries/device-queries";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { AssetsTabHeader } from "@/components/shared/assets-tab-header";

/**
 * Pending component for assets discovery tab
 * Keeps tabs and action buttons visible with inline spinner
 */
const AssetsDiscoveryPending = () => {
  const { organizationId, projectId } = Route.useParams();

  return (
    <Padding>
      <AssetsTabHeader
        organizationId={organizationId}
        projectId={projectId}
        activeTab="discovery"
        disabled
      />
      <PageLoadingFallback compact />
    </Padding>
  );
};

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/discovery")({
  pendingComponent: AssetsDiscoveryPending,
  loader: async ({ context: { queryClient }, params }) => {
    // Discovery tab shows CANDIDATE and EXCLUDED devices
    const verificationStatus = ["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[];

    return queryClient.ensureQueryData(
      deviceQueries.list({
        verificationStatus,
        projectId: params.projectId
      })
    );
  },
  component: AssetsDiscovery,
});

function AssetsDiscovery() {
  const { organizationId, projectId } = Route.useParams();
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const handleDiscoveryCreated = (target: string) => {
    console.log('Discovery started for target:', target);
  };

  const handleDevicesAdded = (deviceIds: string[]) => {
    setNewlyAddedIds(new Set(deviceIds));
    setTimeout(() => {
      setNewlyAddedIds(new Set());
    }, 3000);
  };

  const handleStartDiscovery = () => {
    pushModal("AddDiscovery", {
      onConfirm: handleDiscoveryCreated,
      onDevicesAdded: handleDevicesAdded,
    });
  };

  return (
    <Padding>
      <AssetsTabHeader
        organizationId={organizationId}
        projectId={projectId}
        activeTab="discovery"
        onStartDiscovery={handleStartDiscovery}
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        }
      >
        <DevicesContent newlyAddedIds={newlyAddedIds} projectId={projectId} />
      </Suspense>
    </Padding>
  );
}

function DevicesContent({
  newlyAddedIds,
  projectId
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
}) {
  const verificationStatus = ["CANDIDATE", "EXCLUDED"] as ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[];

  const { data: devicesResponse } = useSuspenseQuery(
    deviceQueries.list({ verificationStatus, projectId })
  );

  const devices = devicesResponse.items;

  return (
    <div className="relative">
      <TableButtons>
        <OverviewRange />
      </TableButtons>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No discovered devices</h3>
          <p className="text-muted-foreground">
            Devices will appear here once they are discovered by the scanner.
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
