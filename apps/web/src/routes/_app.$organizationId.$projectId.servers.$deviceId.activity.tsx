import { createFileRoute } from "@tanstack/react-router";
import { ActivityTimeline } from "@/features/notifications/components/activity-timeline";
import { useDeviceNotifications } from "@/queries/notification-queries";

export const Route = createFileRoute(
  "/_app/$organizationId/$projectId/servers/$deviceId/activity"
)({
  component: ServerActivity,
});

function ServerActivity() {
  const { deviceId } = Route.useParams();
  const { data, isLoading } = useDeviceNotifications(deviceId);

  return <ActivityTimeline notifications={data?.items} isLoading={isLoading} />;
}
