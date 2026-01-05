import { createFileRoute } from "@tanstack/react-router";
import { DeviceOpenPorts } from "@/features/servers/components/device-open-ports";
import { DeviceScheduleList } from "@/components/shared/device-schedule-list";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";

/**
 * Pending component for device overview tab
 * Parent layout already shows tabs, so just show inline spinner
 */
const DeviceOverviewPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/$deviceId/")({
  pendingComponent: DeviceOverviewPending,
  component: DeviceOverview,
});

function DeviceOverview() {
  const { deviceId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Fetch device (React Query will dedupe with parent query)
  const { data: device } = useQuery({
    ...trpc.device.detail.queryOptions({ deviceId, projectId }),
    queryFn: () => trpcClient.device.detail.query({ deviceId, projectId }),
  });

  if (!device) {
    return <PageLoadingFallback compact />;
  }

  return (
    <div className="space-y-6">
      <DeviceOpenPorts
        deviceDetail={device}
        isLoading={false}
      />

      {/* Scan Schedules Section */}
      <DeviceScheduleList
        deviceId={deviceId}
        deviceName={device.name}
      />
    </div>
  );
}
