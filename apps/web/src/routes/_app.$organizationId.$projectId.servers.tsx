import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Servers layout route
 * Device counts are fetched at component level - no blocking here.
 */
export const Route = createFileRoute(
  "/_app/$organizationId/$projectId/servers"
)({
  component: () => <Outlet />,
});
