import { createFileRoute, Outlet } from "@tanstack/react-router";
import { getDeviceCountsServerFn, type DeviceCounts } from "@/server/devices/counts";

/**
 * Servers layout route
 *
 * Prefetches device counts so tab counters are available immediately
 * when switching between Discovery and Verified tabs.
 */

// Context provided by this route
interface ServersRouteContext {
  /** Device counts for tab counters - available immediately */
  deviceCounts: DeviceCounts | undefined;
}

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers")({
  beforeLoad: async ({ params }): Promise<ServersRouteContext> => {
    const { projectId } = params;
    
    try {
      // Prefetch counts for all tabs - lightweight server function
      const counts = await getDeviceCountsServerFn({
        data: { projectId },
      });
      return { deviceCounts: counts };
    } catch (error) {
      // If counts fail to load, still render - child routes will handle gracefully
      return { deviceCounts: undefined };
    }
  },
  component: ServersLayout,
});

function ServersLayout() {
  // Counts are prefetched in beforeLoad and available via Route.useRouteContext()
  // Child routes can access these for immediate tab counter display
  return <Outlet />;
}
