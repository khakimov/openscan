import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Scan, ArrowLeft } from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { deviceQueries, useStartDeviceScanMutation } from "@/queries/device-queries";
import { useSuspenseQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/$organizationId/$projectId/$deviceId")({
  loader: async ({ context: { queryClient }, params }) => {
    // Prefetch device detail for SSR
    await queryClient.ensureQueryData(deviceQueries.detail(params.deviceId));
  },
  component: DevicePage,
});

function DevicePage() {
  const { organizationId, projectId, deviceId } = Route.useParams();

  // Load device detail with suspense
  const { data: device } = useSuspenseQuery(deviceQueries.detail(deviceId));

  // Scan mutation
  const scanMutation = useStartDeviceScanMutation(deviceId);

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
          <Link to={`/${organizationId}/${projectId}/assets` as any}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Assets
            </Button>
          </Link>
          <InlineRouterSpinner className="hidden lg:inline-flex" />
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
            <PageTabsLink href={`/${organizationId}/${projectId}/${deviceId}`} isActive={true}>
              Overview
            </PageTabsLink>
            <PageTabsLink href={`/${organizationId}/${projectId}/${deviceId}/scans`} isActive={false}>
              Scans
            </PageTabsLink>
            <PageTabsLink href={`/${organizationId}/${projectId}/${deviceId}/vulnerabilities`} isActive={false}>
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
