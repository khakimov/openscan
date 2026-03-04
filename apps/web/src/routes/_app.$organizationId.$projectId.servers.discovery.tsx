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
 * Pending component for servers discovery tab
 * Keeps tabs visible while parent route's beforeLoad resolves
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

// Discovery tab shows only CANDIDATE devices (pending review)
// EXCLUDED devices are hidden to avoid clutter
const verificationStatus: ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[] = ["CANDIDATE"];

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/discovery")({
  pendingComponent: ServersDiscoveryPending,
  component: ServersDiscovery,
});

function ServersDiscovery() {
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

  const handleAddDevice = () => {
    pushModal("AddDevice", {
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
        showActions
        onStartDiscovery={handleStartDiscovery}
        onAddDevice={handleAddDevice}
      />
    </Padding>
  );
}

// Wrapper provides DeviceListContext to eliminate N+1 queries
function DevicesContentWrapper({
  newlyAddedIds,
  projectId,
  organizationId,
  showActions,
  onStartDiscovery,
  onAddDevice,
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
  organizationId: string;
  showActions?: boolean;
  onStartDiscovery?: () => void;
  onAddDevice?: () => void;
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
        showActions={showActions}
        onStartDiscovery={onStartDiscovery}
        onAddDevice={onAddDevice}
      />
    </DeviceListProvider>
  );
}

function DevicesContent({
  newlyAddedIds,
  projectId,
  organizationId,
  showActions,
  onStartDiscovery,
  onAddDevice,
}: {
  newlyAddedIds: Set<string>;
  projectId: string;
  organizationId: string;
  showActions?: boolean;
  onStartDiscovery?: () => void;
  onAddDevice?: () => void;
}) {
  // Use device list from context (fetched in bulk with active scans)
  // This replaces N individual queries with 1 bulk query
  const { devices, isLoading } = useDeviceList();
  // Counts from parent layout — persists across tab switches
  const counts = useServerCounts();

  return (
    <div>
      <ServersTabHeader
        organizationId={organizationId}
        projectId={projectId}
        showActions={showActions}
        foundCount={counts?.CANDIDATE}
        monitoredCount={counts?.VERIFIED}
        onStartDiscovery={onStartDiscovery}
        onAddDevice={onAddDevice}
      />
      {isLoading ? (
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
    </div>
  );
}
