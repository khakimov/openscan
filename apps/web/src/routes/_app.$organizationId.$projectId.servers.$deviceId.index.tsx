import { createFileRoute } from "@tanstack/react-router";
import { DeviceOpenPorts } from "@/features/servers/components/device-open-ports";
import { DeviceScheduleList } from "@/components/shared/device-schedule-list";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/integrations/trpc/react";
import { useEffect } from "react";
import { continueScanScheduleTour } from "@/components/shared/onboarding-guide";

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/$deviceId/")({
  component: DeviceOverview,
});

function DeviceOverview() {
  const { deviceId, projectId } = Route.useParams();
  const trpc = useTRPC();

  useEffect(() => {
    continueScanScheduleTour();
  }, []);

  // React Query dedupes with parent — instant if already cached
  const { data: device, isLoading } = useQuery(
    trpc.device.detail.queryOptions({ deviceId, projectId })
  );

  if (isLoading || !device) {
    return <PageLoadingFallback compact />;
  }

  return (
    <div className="space-y-6">
      <DeviceOpenPorts deviceDetail={device} isLoading={false} />
      <div data-tour="scan-schedule">
        <DeviceScheduleList deviceId={deviceId} deviceName={device.name} />
      </div>
    </div>
  );
}
