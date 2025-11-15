import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { TableButtons } from "@/components/shared/data-table";
import { OverviewRange } from "@/features/overview";
import { DeviceDetailSheet } from "@/features/assets";
import { Shield } from "lucide-react";
import { pushModal } from "@/modals";
import { useTRPCClient } from "@/integrations/trpc/react";
import { deviceQueries } from "@/queries/device-queries";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { AssetsTabHeader } from "@/components/shared/assets-tab-header";
import { useProject, useOrganization } from "@/components/layout";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { Spinner } from "@/components/ui/spinner";

/**
 * Pending component for assets discovery tab
 * Keeps tabs and action buttons visible with inline spinner
 *
 * Note: Cannot use context hooks in pending component (renders before gate mounts)
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

// Discovery tab shows CANDIDATE and EXCLUDED devices
const verificationStatus: ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[] = ["CANDIDATE", "EXCLUDED"];

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/discovery")({
  pendingComponent: AssetsDiscoveryPending,
  loader: async ({ context, params }) => {
    // OpenPanel pattern: Use tRPC options proxy in loader
    const devicesQuery = context.trpc.device.list.queryOptions({
      verificationStatus,
      projectId: params.projectId,
    });
    return context.queryClient.fetchQuery(devicesQuery);
  },
  component: AssetsDiscovery,
});

function AssetsDiscovery() {
  const organization = useOrganization();
  const project = useProject();
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  // Prefer slug over ID for friendly URLs (OpenPanel pattern)
  const orgParam = organization.slug ?? organization.id;

  // Track timer for cleanup (external side effect - legitimate useEffect use case)
  const resetTimeoutRef = useRef<number | undefined>(undefined);

  const handleDiscoveryCreated = () => {
    // Discovery started - no-op (reserved for future telemetry)
  };

  const handleDevicesAdded = (deviceIds: string[]) => {
    // Clear any existing timer before setting new one (prevents memory leaks)
    window.clearTimeout(resetTimeoutRef.current);
    setNewlyAddedIds(new Set(deviceIds));

    // Auto-clear highlight after 3 seconds
    resetTimeoutRef.current = window.setTimeout(() => {
      setNewlyAddedIds(new Set());
    }, 3000);
  };

  const handleStartDiscovery = () => {
    pushModal("AddDiscovery", {
      organizationId: organization.id,
      projectId: project.id,
      onConfirm: handleDiscoveryCreated,
      onDevicesAdded: handleDevicesAdded,
    });
  };

  // Cleanup timer on unmount (legitimate external side effect)
  useEffect(() => () => window.clearTimeout(resetTimeoutRef.current), []);

  return (
    <Padding>
      <AssetsTabHeader
        organizationId={orgParam}
        projectId={project.id}
        activeTab="discovery"
        onStartDiscovery={handleStartDiscovery}
      />

      <DevicesContent newlyAddedIds={newlyAddedIds} projectId={project.id} />
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
  // OpenPanel pattern: Use tRPC client with initialData from loader
  const loaderData = Route.useLoaderData();
  const trpcClient = useTRPCClient();
  const { data: devicesResponse, isFetching } = useQuery({
    queryKey: deviceQueries.list.key({ verificationStatus, projectId }),
    queryFn: () => trpcClient.device.list.query({
      verificationStatus,
      projectId,
    }),
    initialData: loaderData, // Use SSR data to avoid redundant fetch
    placeholderData: keepPreviousData,
  });

  // Memoize devices array to prevent unnecessary re-renders
  const devices = useMemo(
    () => devicesResponse?.items ?? [],
    [devicesResponse?.items]
  );

  return (
    <div className="relative">
      {isFetching && devicesResponse && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
          <Spinner size="lg" />
          <span className="text-sm text-muted-foreground">Refreshing devices…</span>
        </div>
      )}

      <TableButtons>
        <OverviewRange />
      </TableButtons>

      {!devicesResponse ? (
        <PageLoadingFallback compact />
      ) : devices.length === 0 ? (
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
