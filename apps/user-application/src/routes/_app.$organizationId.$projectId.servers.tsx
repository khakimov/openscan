import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Servers layout route
 *
 * This is a passthrough layout that exists to satisfy TanStack Router's
 * file-based routing structure for nested servers routes.
 *
 * Routes under this layout:
 * - /servers/ (redirects to /servers/discovery)
 * - /servers/discovery
 * - /servers/verified
 * - /servers/$deviceId (device details)
 *
 * Each child route has its own loader that fetches organization and project data.
 */

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers")({
  component: ServersLayout,
});

function ServersLayout() {
  // Passthrough - just render children
  return <Outlet />;
}
