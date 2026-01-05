import { createFileRoute } from "@tanstack/react-router";
import { ActivityTimeline } from "@/features/notifications/components/activity-timeline";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { useDeviceNotifications } from "@/queries/notification-queries";

/**
 * Pending component for activity tab
 * Parent layout already shows tabs, so just show inline spinner
 */
const ActivityPending = () => <PageLoadingFallback compact />;

export const Route = createFileRoute(
  "/_app/$organizationId/$projectId/servers/$deviceId/activity"
)({
  pendingComponent: ActivityPending,
  component: ServerActivity,
});

function ServerActivity() {
  const { deviceId } = Route.useParams();
  const { data, isLoading } = useDeviceNotifications(deviceId);

  return <ActivityTimeline notifications={data?.items} isLoading={isLoading} />;
}
