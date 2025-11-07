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
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/verified")({
  loader: async ({ context: { queryClient }, params }) => {
    // Verified tab shows only VERIFIED devices
    const verificationStatus = "VERIFIED" as const;

    return queryClient.ensureQueryData(
      deviceQueries.list({
        verificationStatus,
        projectId: params.projectId
      })
    );
  },
  component: AssetsVerified,
});

function AssetsVerified() {
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

  return (
    <Padding>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PageTabs>
            <PageTabsLink href={`/${organizationId}/${projectId}/assets/discovery`} isActive={false}>
              Discovery
            </PageTabsLink>
            <PageTabsLink href={`/${organizationId}/${projectId}/assets/verified`} isActive={true}>
              Verified
            </PageTabsLink>
          </PageTabs>
          <InlineRouterSpinner className="hidden lg:inline-flex" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => pushModal("AddDevice", {})}>
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
  const verificationStatus = "VERIFIED" as const;

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
          <h3 className="text-lg font-semibold mb-2">No verified devices</h3>
          <p className="text-muted-foreground">
            Manually added or verified devices will appear here.
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
