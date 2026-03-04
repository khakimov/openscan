import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { DeviceDetailSheet } from "@/features/servers/components/device-detail-sheet";
import { DeviceListProvider, useDeviceList } from "@/features/servers/context/device-list-context";
import { Shield } from "lucide-react";
import { pushModal } from "@/modals";
import { useState, useEffect, useRef } from "react";
import { ServersTabHeader } from "@/components/shared/servers-tab-header";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { useServerCounts } from "./_app.$organizationId.$projectId.servers";

/**
 * Pending component for servers verified tab
 * Keeps tabs visible while parent route's beforeLoad resolves
 */
const ServersVerifiedPending = () => {
  const { organizationId, projectId } = Route.useParams();

  return (
    <Padding>
      <ServersTabHeader
        organizationId={organizationId}
        projectId={projectId}
        disabled
      />
      <PageLoadingFallback compact />
    </Padding>
  );
};

// Verified tab shows only VERIFIED devices
const verificationStatus: ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[] = ["VERIFIED"];

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/verified")({
  pendingComponent: ServersVerifiedPending,
  component: ServersVerified,
});

function ServersVerified() {
  // ✅ Get organization and project from parent route context (via beforeLoad)
  const { organization, project } = Route.useRouteContext();
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  // Prefer slug over ID for friendly URLs (OpenPanel pattern)
  const orgParam = organization.slug ?? organization.id;
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
      target: project.domain || undefined,
      onConfirm: handleDiscoveryCreated,
      onDevicesAdded: handleDevicesAdded,
    });
  };

  // Cleanup timer on unmount (legitimate external side effect)
  useEffect(() => () => window.clearTimeout(resetTimeoutRef.current), []);

  return (
    <Padding>
      <DevicesContentWrapper 
        newlyAddedIds={newlyAddedIds} 
        projectId={project.id} 
        organizationId={orgParam}
        onStartDiscovery={handleStartDiscovery}
      />
    </Padding>
  );
}

// Wrapper provides DeviceListContext to eliminate N+1 queries
function DevicesContentWrapper({
  newlyAddedIds,
  projectId,
  organizationId,
  onStartDiscovery,
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
  organizationId: string;
  onStartDiscovery?: () => void;
}) {
  return (
    <DeviceListProvider 
      projectId={projectId} 
      verificationStatus={verificationStatus}
    >
      <DevicesContent 
        newlyAddedIds={newlyAddedIds} 
        projectId={projectId} 
        organizationId={organizationId}
        onStartDiscovery={onStartDiscovery}
      />
    </DeviceListProvider>
  );
}

function DevicesContent({
  newlyAddedIds,
  projectId,
  organizationId,
  onStartDiscovery,
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
  organizationId: string;
  onStartDiscovery?: () => void;
}) {
  // Use device list from context (fetched in bulk with active scans)
  const { devices, isLoading } = useDeviceList();
  // Counts from parent layout — persists across tab switches
  const counts = useServerCounts();

  return (
    <div>
      <ServersTabHeader
        organizationId={organizationId}
        projectId={projectId}
        foundCount={counts?.CANDIDATE}
        monitoredCount={counts?.VERIFIED}
        onStartDiscovery={onStartDiscovery}
      />
      {isLoading ? (
        <PageLoadingFallback compact />
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No monitored servers</h3>
          <p className="text-muted-foreground">
            Servers you monitor will appear here once verified from the Discovery tab.
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
    </div>
  );
}
