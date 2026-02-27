import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/integrations/trpc/react";
import type { ProjectRouteContext } from "@/router";
import type { DeviceCounts } from "@/features/servers/context/device-list-context";

/**
 * Servers tab counts context
 * Persists counts across Discovery ↔ Verified tab switches
 * so tabs don't flash empty while the child DeviceListProvider remounts.
 */
const ServerCountsContext = createContext<DeviceCounts | undefined>(undefined);

export function useServerCounts() {
  return useContext(ServerCountsContext);
}

export const Route = createFileRoute(
  "/_app/$organizationId/$projectId/servers"
)({
  component: ServersLayout,
});

function ServersLayout() {
  const { project } = Route.useRouteContext() as ProjectRouteContext;
  const trpc = useTRPC();

  // Lightweight counts query — doesn't block rendering
  const { data: counts } = useQuery({
    ...trpc.device.counts.queryOptions({ projectId: project.id }),
    // Keep previous counts visible during refetch
    placeholderData: (prev) => prev,
  });

  return (
    <ServerCountsContext.Provider value={counts}>
      <Outlet />
    </ServerCountsContext.Provider>
  );
}
