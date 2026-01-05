import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { DeviceDetailSheet } from "@/features/servers";
import { Shield } from "lucide-react";
import { pushModal } from "@/modals";
import { useTRPCClient } from "@/integrations/trpc/react";
import { deviceQueries } from "@/queries/device-queries";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { ServersTabHeader } from "@/components/shared/servers-tab-header";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { Spinner } from "@/components/ui/spinner";

/**
 * Pending component for servers discovery tab
 * Keeps tabs and action buttons visible with inline spinner
 *
 * Note: Cannot use context hooks in pending component (renders before gate mounts)
 */
const ServersDiscoveryPending = () => {
  const { organizationId, projectId } = Route.useParams();

  return (
    <Padding>
      <ServersTabHeader
        organizationId={organizationId}
        projectId={projectId}
        showActions
        disabled
      />
      <PageLoadingFallback compact />
    </Padding>
  );
};

// Discovery tab shows CANDIDATE and EXCLUDED devices
const verificationStatus: ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[] = ["CANDIDATE", "EXCLUDED"];

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/discovery")({
  pendingComponent: ServersDiscoveryPending,
  // No loader - inherit organization and project from parent route (_app.$organizationId.$projectId)
  component: ServersDiscovery,
});

function ServersDiscovery() {
  // ✅ Get organization and project from parent route context (via beforeLoad)
  const { organization, project } = Route.useRouteContext();
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
  const trpcClient = useTRPCClient();

  // Prefer slug over ID for friendly URLs (OpenPanel pattern)
  const orgParam = organization.slug ?? organization.id;

  // Query counts for tab badges
  const { data: discoveryData } = useQuery({
    queryKey: deviceQueries.list.key({ verificationStatus: ["CANDIDATE", "EXCLUDED"], projectId: project.id }),
    queryFn: () => trpcClient.device.list.query({
      verificationStatus: ["CANDIDATE", "EXCLUDED"],
      projectId: project.id,
    }),
  });

  const { data: verifiedData } = useQuery({
    queryKey: deviceQueries.list.key({ verificationStatus: ["VERIFIED"], projectId: project.id }),
    queryFn: () => trpcClient.device.list.query({
      verificationStatus: ["VERIFIED"],
      projectId: project.id,
    }),
  });

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

  const handleAddDevice = () => {
    pushModal("AddDevice", {
      onDevicesAdded: handleDevicesAdded,
    });
  };

  // Cleanup timer on unmount (legitimate external side effect)
  useEffect(() => () => window.clearTimeout(resetTimeoutRef.current), []);

  return (
    <Padding>
      <ServersTabHeader
        organizationId={orgParam}
        projectId={project.id}
        showActions
        foundCount={discoveryData?.totalCount}
        monitoredCount={verifiedData?.totalCount}
        onStartDiscovery={handleStartDiscovery}
        onAddDevice={handleAddDevice}
      />

      <DevicesContent newlyAddedIds={newlyAddedIds} projectId={project.id} organizationId={orgParam} />
    </Padding>
  );
}

function DevicesContent({
  newlyAddedIds,
  projectId,
  organizationId,
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
  organizationId: string;
}) {
  // Use flat list query - DeviceCards fetch their own activeScans/scanHistory via polling
  const trpcClient = useTRPCClient();
  const { data: devicesResponse, isFetching } = useQuery({
    queryKey: deviceQueries.list.key({ verificationStatus, projectId }),
    queryFn: () => trpcClient.device.list.query({
      verificationStatus,
      projectId,
    }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
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

      {!devicesResponse ? (
        <PageLoadingFallback compact />
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No servers found</h3>
          <p className="text-muted-foreground">
            Click <strong>Add Servers</strong> to manually add servers, or click <strong>Start Discovery</strong> to automatically find subdomains for your domain.
          </p>
        </div>
      ) : (
        <DeviceDetailSheet
          devices={devices}
          newlyAddedIds={newlyAddedIds}
          projectId={projectId}
          organizationId={organizationId}
        />
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
