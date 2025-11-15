import { createFileRoute, Outlet, redirect, notFound, ErrorComponentProps } from "@tanstack/react-router";
import { Suspense } from "react";
import {
  Sidebar,
  type SidebarOrganization,
  type SidebarUser,
} from "@/components/layout/sidebar";
import { AppLayout, AppLayoutPending } from "@/components/layout";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { ErrorLayout } from "@/components/error-layout";

// File extensions to block from routing (must match $organizationId route)
const FILE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'ico',  // Images
  'js', 'xml', 'txt', 'json', 'webmanifest',          // Static files
  'css', 'map', 'woff', 'woff2', 'ttf', 'eot',        // Assets
];

/**
 * Check if path looks like a static file request
 */
const isStaticFile = (path: string): boolean => {
  const pathSegments = path.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || '';
  return FILE_EXTENSIONS.some((extension) => lastSegment.endsWith(`.${extension}`));
};

/**
 * App-level error component
 * Catches errors from child routes (org, project) and shows styled error page
 */
function AppError({ error }: ErrorComponentProps) {
  const statusCode = (error as any)?.statusCode ?? 500;
  const is404 = statusCode === 404;
  const is403 = statusCode === 403;

  const status = is404 ? 404 : is403 ? 403 : 500;
  const title = is404
    ? "Page Not Found"
    : is403
    ? "Access Denied"
    : "Something Went Wrong";
  const message = is404
    ? "The page you're looking for doesn't exist or has been removed."
    : is403
    ? "You don't have permission to access this resource."
    : error instanceof Error
    ? error.message
    : "An unexpected error occurred.";

  return (
    <ErrorLayout
      status={status}
      title={title}
      message={message}
      actions={[
        { label: "Go Home", to: "/", variant: "default" },
        { label: "Go Back", onClick: () => window.history.back(), variant: "outline" },
      ]}
    />
  );
}

export const Route = createFileRoute("/_app")({
  pendingComponent: AppLayoutPending,
  errorComponent: AppError,
  beforeLoad: async ({ location, context }) => {
    // Block static file requests early (before auth checks)
    if (isStaticFile(location.pathname)) {
      throw notFound();
    }

    // Check session via tRPC (OpenPanel pattern)
    const sessionQuery = context.trpc.auth.session.queryOptions();
    const sessionData = await context.queryClient.ensureQueryData(sessionQuery);

    if (!sessionData?.session) {
      throw redirect({
        to: "/",
        search: {
          redirect: location.href,
        },
      });
    }

    return { user: sessionData.session.user };
  },
  loader: async ({ context }) => {
    // Fetch session + organizations in parallel (OpenPanel pattern)
    // Use ensureQueryData to reuse SSR cache and avoid duplicate HTTP roundtrips
    const [sessionData, organizations] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.auth.session.queryOptions()
      ),
      context.queryClient.ensureQueryData(
        context.trpc.organization.list.queryOptions()
      ),
    ]);

    const session = sessionData?.session;

    // Map organizations for sidebar
    const sidebarOrgs: SidebarOrganization[] = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }));

    // Determine active organization (use session or fallback to first org)
    const activeOrganization: SidebarOrganization | null = session?.activeOrganizationId
      ? sidebarOrgs.find((org) => org.id === session.activeOrganizationId) ?? sidebarOrgs[0] ?? null
      : sidebarOrgs[0] ?? null;

    // Fetch projects for active organization (only if organization exists)
    // OpenPanel pattern: Short-circuit if no org (new account pending onboarding)
    // Let genuine access errors (403, 404, 500) bubble to error boundary
    // Return raw tRPC shape (map to SidebarProject in components, not loader)
    const projects = activeOrganization?.id
      ? await context.queryClient.ensureQueryData(
          context.trpc.project.listByOrg.queryOptions({
            organizationId: activeOrganization.id,
          })
        )
      : [];

    const sidebarUser: SidebarUser | null = session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: null,
        }
      : null;

    return {
      user: sidebarUser,
      activeOrganization,
      organizations: sidebarOrgs,
      projects,
    };
  },
  component: AppLayoutComponent,
});

function AppLayoutComponent() {
  const { user, activeOrganization, organizations, projects } =
    Route.useLoaderData();

  return (
    <AppLayout
      sidebar={
        <Sidebar
          user={user}
          activeOrganization={activeOrganization}
          organizations={organizations}
          projects={projects}
        />
      }
    >
      {/* Suspense allows sidebar to render while child route loads */}
      <Suspense fallback={<PageLoadingFallback />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}
