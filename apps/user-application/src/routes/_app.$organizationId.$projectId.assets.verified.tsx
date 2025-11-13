import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { TableButtons } from "@/components/shared/data-table";
import { OverviewRange } from "@/features/overview";
import { DeviceDetailSheet } from "@/features/assets";
import { Shield } from "lucide-react";
import { pushModal } from "@/modals";
import { deviceQueries } from "@/queries/device-queries";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { AssetsTabHeader } from "@/components/shared/assets-tab-header";
import { useProject, useOrganization } from "@/components/layout";

/**
 * Pending component for assets verified tab
 * Keeps tabs and action buttons visible with inline spinner
 *
 * Note: Cannot use context hooks in pending component (renders before gate mounts)
 */
const AssetsVerifiedPending = () => {
  const { organizationId, projectId } = Route.useParams();

  return (
    <Padding>
      <AssetsTabHeader
        organizationId={organizationId}
        projectId={projectId}
        activeTab="verified"
        disabled
      />
      <PageLoadingFallback compact />
    </Padding>
  );
};

// Verified tab shows only VERIFIED devices
const verificationStatus: "CANDIDATE" | "VERIFIED" | "EXCLUDED" = "VERIFIED";

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/verified")({
  pendingComponent: AssetsVerifiedPending,
  loader: async ({ context: { queryClient }, params }) => {
    // Use query helper for both loader and component (single source of truth)
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
        activeTab="verified"
        onStartDiscovery={handleStartDiscovery}
      />

      <Suspense fallback={<PageLoadingFallback compact />}>
        <DevicesContent newlyAddedIds={newlyAddedIds} projectId={project.id} />
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
  // Use same query helper as loader (keeps queryKey, staleTime, gcTime consistent)
  const devicesQuery = deviceQueries.list({ verificationStatus, projectId });
  const { data: devicesResponse } = useSuspenseQuery(devicesQuery);

  // Memoize devices array to prevent unnecessary re-renders
  const devices = useMemo(() => devicesResponse.items, [devicesResponse.items]);

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
