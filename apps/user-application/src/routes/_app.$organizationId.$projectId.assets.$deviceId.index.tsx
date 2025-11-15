import { createFileRoute } from "@tanstack/react-router";
import { DeviceOpenPorts } from "@/features/assets/components/device-open-ports";
import { useQuery } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import type { TransformedDevice } from "@repo/contracts/device";
import { DeviceScheduleList } from "@/components/shared/device-schedule-list";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

/**
 * Pending component for device overview tab
 * Parent layout already shows tabs, so just show inline spinner
 */
const DeviceOverviewPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets/$deviceId/")({
  pendingComponent: DeviceOverviewPending,
  component: DeviceOverview,
});

function DeviceOverview() {
  // Organization and project come from gate context (no need to re-read params)
  // Only deviceId comes from params since it's specific to this route level
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Load device detail with tRPC (parent layout prefetches this)
  // Note: organizationId comes from session on server, not from params
  const { data: device } = useQuery({
    ...trpc.device.detail.queryOptions({ deviceId }),
    queryFn: () => trpcClient.device.detail.query({ deviceId }),
  });

  if (!device) {
    return <PageLoadingFallback compact />;
  }

  return (
    <div className="space-y-6">
      <DeviceOpenPorts
        deviceDetail={device as TransformedDevice}
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
