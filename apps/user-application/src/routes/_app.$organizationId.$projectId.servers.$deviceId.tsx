import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Scan, ArrowLeft } from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { useStartDeviceScanMutation } from "@/queries/device-queries";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { DeviceHeaderSkeleton } from "@/components/shared/skeletons";

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
            to="/$organizationId/$projectId/servers/verified"
            params={{ organizationId, projectId }}
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Servers
            </Button>
          </Link>
        </div>

        {/* Header skeleton (reusable component) */}
        <DeviceHeaderSkeleton />

        {/* Tabs (static, always visible) */}
        <div className="flex items-center gap-3 mt-6">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId"
              params={{ organizationId, projectId, deviceId }}
            >
              Overview
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/scans"
              params={{ organizationId, projectId, deviceId }}
            >
              Scans
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/vulnerabilities"
              params={{ organizationId, projectId, deviceId }}
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

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/$deviceId")({
  pendingComponent: DevicePagePending,
  // No loader - fetch client-side with React Query
  // No error boundary - React Query handles fetch errors internally
  component: DevicePage,
});

function DevicePage() {
  // ✅ Get organization and project from parent route context (via beforeLoad)
  const { organization, project } = Route.useRouteContext();
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // All hooks must be called before any early returns
  const scanMutation = useStartDeviceScanMutation(deviceId);

  // Load device detail with tRPC
  const { data: device } = useQuery({
    ...trpc.device.detail.queryOptions({ deviceId, projectId: project?.id ?? "" }),
    queryFn: () => trpcClient.device.detail.query({ deviceId, projectId: project?.id ?? "" }),
    enabled: !!project?.id,
  });

  // Prefer slug for friendly URLs
  const orgParam = organization?.slug ?? organization?.id;

  if (!device) {
    return <PageLoadingFallback />;
  }

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
            to="/$organizationId/$projectId/servers/verified"
            params={{
              organizationId: organization.slug ?? organization.id,
              projectId: project.id
            }}
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Servers
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

        {/* Navigation Tabs - active state auto-detected by TanStack Router */}
        <div className="flex items-center gap-3 mt-6">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Overview
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/scans"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Scans
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/vulnerabilities"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Vulnerabilities
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/activity"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Activity
            </PageTabsLink>
          </PageTabs>
        </div>
      </div>

      {/* Outlet for child routes (overview, scans, vulnerabilities, activity) */}
      <Outlet />
    </Padding>
  );
}
