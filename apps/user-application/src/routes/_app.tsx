import { createFileRoute, Outlet, redirect, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import {
  Sidebar,
  type SidebarOrganization,
  type SidebarProject,
  type SidebarUser,
} from "@/components/layout/sidebar";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { getCurrentUser } from "@/server/auth";
import {
  getUserOrganizations,
  getActiveOrganization,
} from "@/server/organization";
import { getOrganizationProjects } from "@/server/projects";

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

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    // Block static file requests early (before auth checks)
    if (isStaticFile(location.pathname)) {
      throw notFound();
    }

    const user = await getCurrentUser();
    if (!user) {
      throw redirect({
        to: "/",
        search: {
          redirect: location.href,
        },
      });
    }
    return { user };
  },
  loader: async () => {
    // Fetch user (already authenticated from beforeLoad)
    const user = await getCurrentUser();

    // Fetch organizations
    const organizationsResult = await getUserOrganizations();
    const organizations: SidebarOrganization[] =
      organizationsResult.organizations.map((org) => ({
        id: org.id,
        name: org.name,
        slug: "slug" in org && typeof org.slug === "string" ? org.slug : null,
      }));

    // Fetch active organization from session (may return null, that's ok)
    const activeOrgResult = await getActiveOrganization().catch(() => ({
      success: false,
      organization: null,
    }));

    const activeOrganization: SidebarOrganization | null =
      activeOrgResult.success && activeOrgResult.organization
        ? activeOrgResult.organization
        : organizations[0] || null; // Fallback to first org if activeOrg fails

    // Fetch projects for current organization
    let projects: SidebarProject[] = [];
    try {
      const projectsResult = await Promise.race([
        getOrganizationProjects(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Projects fetch timeout')), 5000)
        ),
      ]) as Awaited<ReturnType<typeof getOrganizationProjects>>;

      if (projectsResult.success) {
        projects = projectsResult.projects.map((project: any) => ({
          id: project.id,
          name: project.name,
          domain: project.domain ?? null,
          description: project.description ?? null,
        }));
      }
    } catch (error) {
      // Silently fail if no organization yet (e.g., during onboarding)
    }

    const sidebarUser: SidebarUser | null = user
      ? {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          image: null, // Image not available from getCurrentUser
        }
      : null;

    return {
      user: sidebarUser,
      activeOrganization,
      organizations,
      projects,
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, activeOrganization, organizations, projects } =
    Route.useLoaderData();

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Sidebar renders immediately when _app loader completes */}
      <Sidebar
        user={user}
        activeOrganization={activeOrganization}
        organizations={organizations}
        projects={projects}
      />

      <div className="w-full flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-muted/20 p-2 pt-14 lg:pt-2">
          <div className="max-w-7xl">
            {/* Suspense allows sidebar to render while child route loads */}
            <Suspense fallback={<PageLoadingFallback />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
