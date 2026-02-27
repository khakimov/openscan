import {
  createFileRoute,
  Outlet,
  notFound,
  redirect,
} from "@tanstack/react-router";
import type { OrganizationRouteContext } from "@/router";
import {
  isReservedOrganizationId,
  isStaticFile,
} from "@/lib/reserved-ids";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

export const Route = createFileRoute("/_app/$organizationId")({
  pendingComponent: PageLoadingFallback,
  beforeLoad: async ({ params, location, context }) => {
    if (isReservedOrganizationId(params.organizationId)) throw notFound();
    if (isStaticFile(params.organizationId)) throw notFound();

    const identifier = params.organizationId;

    // Fetch org first (resolves slug → ID), then projects with resolved ID
    const organization = await context.queryClient.ensureQueryData(
      context.trpc.organization.get.queryOptions({ organizationId: identifier })
    );

    const projects = await context.queryClient
      .ensureQueryData(
        context.trpc.project.listByOrg.queryOptions({ organizationId: organization.id })
      )
      .catch(() => [] as any[]);

    // Redirect ID → slug for cleaner URLs
    if (organization.slug && identifier === organization.id) {
      const newPath = location.pathname.replace(
        `/${organization.id}`,
        `/${organization.slug}`
      );
      throw redirect({ to: newPath, search: location.search as any, replace: true });
    }

    // Fire-and-forget: sync session org if needed
    const currentSessionOrgId = context.session?.session?.activeOrganizationId;
    if (currentSessionOrgId !== organization.id) {
      fetch("/trpc/organization.syncActive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          json: { organizationId: identifier, currentSessionOrgId },
        }),
      }).catch(() => {});
    }

    return { organization, projects } satisfies Pick<
      OrganizationRouteContext,
      "organization" | "projects"
    >;
  },
  component: () => <Outlet />,
});
