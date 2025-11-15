import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Assets layout route
 *
 * This is a passthrough layout that exists to satisfy TanStack Router's
 * file-based routing structure for nested assets routes.
 *
 * Routes under this layout:
 * - /assets/ (redirects to /assets/discovery)
 * - /assets/discovery
 * - /assets/verified
 * - /assets/$deviceId (device details)
 *
 * The project context is inherited from the parent $projectId layout.
 */

export const Route = createFileRoute("/_app/$organizationId/$projectId/assets")({
  component: AssetsLayout,
});

function AssetsLayout() {
  // Passthrough - just render children
  // Project context comes from parent $projectId route via ProjectGate
  return <Outlet />;
}
