import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  Sidebar,
  type SidebarOrganization,
  type SidebarProject,
  type SidebarUser,
} from "@/components/layout/sidebar";
import { getCurrentUser } from "@/server/auth";
import {
  getUserOrganizations,
  getActiveOrganization,
} from "@/server/organization";
import { getOrganizationProjects } from "@/server/projects";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
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

    // Fetch active organization from session
    const activeOrgResult = await getActiveOrganization();
    const activeOrganization: SidebarOrganization | null =
      activeOrgResult.success && activeOrgResult.organization
        ? activeOrgResult.organization
        : null;

    // Fetch projects for current organization
    let projects: SidebarProject[] = [];
    try {
      const projectsResult = await getOrganizationProjects();
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
      console.error("Failed to fetch projects:", error);
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
  component: RouteComponent,
});

function RouteComponent() {
  const { user, activeOrganization, organizations, projects } =
    Route.useLoaderData();

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        user={user}
        activeOrganization={activeOrganization}
        organizations={organizations}
        projects={projects}
      />

      <div className="w-full flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-muted/20 p-2 pt-14 lg:pt-2">
          <div className="max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
