import { createFileRoute, Outlet, Link, useLocation, useRouter, ErrorComponentProps } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Scan, ArrowLeft, AlertCircle } from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { deviceQueries, useStartDeviceScanMutation } from "@/queries/device-queries";
import { useSuspenseQuery, useQueryErrorResetBoundary } from "@tanstack/react-query";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { DeviceHeaderSkeleton } from "@/components/shared/skeletons";
import { useProject, useOrganization } from "@/components/layout";

/**
 * Pending component for device detail layout
 * Shows header skeleton and tabs while device loads
 *
 * Note: Cannot use context hooks in pending component (renders before gate mounts)
 */
const DevicePagePending = () => {
  const { organizationId, projectId, deviceId } = Route.useParams();

  return (
    <Padding>
      <div className="mb-4">
        {/* Back button (static, always visible) */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/$organizationId/$projectId/assets/verified"
            params={{ organizationId, projectId }}
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Assets
            </Button>
          </Link>
        </div>

        {/* Header skeleton (reusable component) */}
        <DeviceHeaderSkeleton />

        {/* Tabs (static, always visible) */}
        <div className="flex items-center gap-3 mt-6">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId"
              params={{ organizationId, projectId, deviceId }}
              isActive={true}
            >
              Overview
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId/scans"
              params={{ organizationId, projectId, deviceId }}
              isActive={false}
            >
              Scans
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId/vulnerabilities"
              params={{ organizationId, projectId, deviceId }}
              isActive={false}
            >
              Vulnerabilities
            </PageTabsLink>
          </PageTabs>
        </div>
      </div>

      <PageLoadingFallback compact />
    </Padding>
  );
};

/**
 * Error boundary for device fetch failures
 * Follows TanStack posts.$postId pattern with retry capability
 */
function DeviceErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { reset: resetQuery } = useQueryErrorResetBoundary();
  const { organizationId, projectId } = Route.useParams();

  const handleRetry = () => {
    // Reset React Query error boundary
    resetQuery();
    // Invalidate router to retry loader
    router.invalidate();
    // Reset error boundary
    reset();
  };

  return (
    <Padding>
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Failed to Load Device</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {error instanceof Error ? error.message : 'An error occurred while loading the device details.'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleRetry}>
            Try Again
          </Button>
          <Link
            to="/$organizationId/$projectId/assets/verified"
            params={{ organizationId, projectId }}
          >
            <Button variant="ghost">
              Back to Assets
            </Button>
          </Link>
        </div>
      </div>
    </Padding>
  );
}

export const Route = createFileRoute("/_app/$organizationId/$projectId/$deviceId")({
  pendingComponent: DevicePagePending,
  errorComponent: DeviceErrorBoundary,
  loader: async ({ context: { queryClient }, params }) => {
    // Guard: Validate deviceId doesn't look like a route segment or URL
    if (params.deviceId.includes('/') || params.deviceId.includes('?') || params.deviceId.includes('&')) {
      console.error('[deviceId route loader] Invalid deviceId detected:', params.deviceId);
      throw new Error(`Invalid device ID: ${params.deviceId}`);
    }

    // Prefetch device detail for SSR
    // Note: organizationId comes from session on server, not from params
    await queryClient.ensureQueryData(deviceQueries.detail(params.deviceId));
  },
  component: DevicePage,
});

function DevicePage() {
  const organization = useOrganization();
  const project = useProject();
  const { deviceId } = Route.useParams();
  const location = useLocation();

  // Load device detail with suspense
  // Note: organizationId comes from session on server, not from params
  const { data: device } = useSuspenseQuery(deviceQueries.detail(deviceId));

  // Scan mutation
  const scanMutation = useStartDeviceScanMutation(deviceId);

  // Determine active tab based on current pathname
  const pathname = location.pathname;
  const orgParam = organization.slug ?? organization.id; // Prefer slug for friendly URLs
  const isOverviewActive = pathname === `/${orgParam}/${project.id}/${deviceId}` || pathname === `/${orgParam}/${project.id}/${deviceId}/`;
  const isScansActive = pathname.includes('/scans');
  const isVulnerabilitiesActive = pathname.includes('/vulnerabilities');

  // Action handlers
  const handleEdit = () => {
    pushModal("EditDevice", {
      deviceId: device.id,
      device: device,
    });
  };

  const handleDelete = () => {
    pushModal("DeleteDeviceConfirm", {
      deviceId: device.id,
      deviceName: device.name,
    });
  };

  const handleScan = () => {
    const target = device.name || device.ip;
    if (!target) {
      toast.error("No valid target found for scanning");
      return;
    }

    const toastId = `scan-${device.id}`;
    toast.loading(`Starting scan for ${target}...`, { id: toastId });

    scanMutation.mutate(
      { deviceId: device.id, target, preset: "THOROUGH" },
      {
        onSuccess: (result) => {
          if (result.success && result.scanId) {
            toast.success(`Scan started for ${result.target}`, {
              id: toastId,
              description: result.presetDescription || `Scan ID: ${result.scanId}`,
            });
          } else {
            toast.error(`Failed to start scan: ${result.error}`, { id: toastId });
          }
        },
        onError: (error) => {
          toast.error("Failed to start port scan", {
            id: toastId,
            description: error instanceof Error ? error.message : "Unknown error",
          });
        },
      }
    );
  };

  return (
    <Padding>
      {/* Header with back button and actions */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/$organizationId/$projectId/assets/verified"
            params={{ organizationId: organization.id, projectId: project.id }}
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Assets
            </Button>
          </Link>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{device.name}</h1>
            <p className="text-muted-foreground mt-1">{device.ip}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleScan}
              disabled={scanMutation.isPending}
              className="flex items-center gap-2"
            >
              <Scan className="h-4 w-4" />
              <span className="hidden sm:inline">
                {scanMutation.isPending ? "Scanning..." : "Scan"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="flex items-center gap-2"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="flex items-center gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 mt-6">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
              isActive={isOverviewActive}
            >
              Overview
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId/scans"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
              isActive={isScansActive}
            >
              Scans
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/$deviceId/vulnerabilities"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
              isActive={isVulnerabilitiesActive}
            >
              Vulnerabilities
            </PageTabsLink>
          </PageTabs>
        </div>
      </div>

      {/* Outlet for child routes (overview, scans, vulnerabilities) */}
      <Outlet />
    </Padding>
  );
}
