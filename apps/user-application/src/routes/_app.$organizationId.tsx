import {
  createFileRoute,
  Outlet,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { syncActiveOrganization } from "@/server/organization";
import type { OrganizationRouteContext } from "@/router";
import {
  isReservedOrganizationId,
  isStaticFile,
} from "@/lib/reserved-ids";
import { OrganizationPendingShell } from "@/components/shared/pending-shells";

export const Route = createFileRoute("/_app/$organizationId")({
  pendingComponent: OrganizationPendingShell,
  beforeLoad: async ({ params, location, context }) => {
    // Block reserved organization IDs
    if (isReservedOrganizationId(params.organizationId)) {
      throw notFound();
    }

    // Block static file paths from routing
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }

    const identifier = params.organizationId;

    // OpenPanel pattern: Use tRPC queryOptions for organization data
    // This ensures data is cached in React Query and can be invalidated by mutations
    const organization = await context.queryClient.ensureQueryData(
      context.trpc.organization.get.queryOptions({ organizationId: identifier })
    );

    // Fetch projects using the resolved organization ID (not the slug)
    // Projects are stored with organizationId, not slug
    const projects = await context.queryClient.ensureQueryData(
      context.trpc.project.listByOrg.queryOptions({ organizationId: organization.id })
    ).catch(() => []);

    // Redirect from ID to slug for cleaner URLs
    if (organization.slug && identifier === organization.id) {
      const newPath = location.pathname.replace(`/${organization.id}`, `/${organization.slug}`);

      throw redirect({
        to: newPath,
        search: location.search as any,
        replace: true,
      });
    }

    // Sync URL organization → session (if different)
    const session = context.session?.session;
    const currentSessionOrgId = session?.activeOrganizationId;

    if (session && currentSessionOrgId !== organization.id) {
      await syncActiveOrganization({
        data: {
          organizationId: identifier,
          currentSessionOrgId,
        },
      });
    }

    // Return organization and projects in context for child routes
    return {
      organization,
      projects,
    } satisfies Pick<OrganizationRouteContext, "organization" | "projects">;
  },
  component: OrganizationLayout,
});

function OrganizationLayout() {
  return <Outlet />;
}
