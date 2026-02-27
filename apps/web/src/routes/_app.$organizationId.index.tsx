import { createFileRoute, redirect } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { Button } from "@/components/ui/button";
import { PlusIcon, FolderIcon } from "lucide-react";
import { pushModal } from "@/modals";
import type { ProjectEntity } from "@repo/contracts/project";
import type { OrganizationRouteContext } from "@/router";
import { getProjectDefaultRoute } from "@/lib/navigation";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

export const Route = createFileRoute("/_app/$organizationId/")({
  pendingComponent: PageLoadingFallback,
  beforeLoad: async ({ params, context }) => {
    const { projects } = context as OrganizationRouteContext;

    // Auto-redirect to project default route if only ONE project exists
    if (projects.length === 1) {
      throw redirect({
        to: getProjectDefaultRoute(),
        params: {
          organizationId: params.organizationId,
          projectId: projects[0].id,
        },
      });
    }

    // Context already contains organization and projects from parent route
    // No need to return them again
  },
  component: OrganizationIndex,
});

function OrganizationIndex() {
  const { organization, projects } = Route.useRouteContext() as OrganizationRouteContext;

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <FolderIcon className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">No projects found</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Create your first project to start scanning and managing devices.
        </p>
        <Button onClick={() => pushModal("AddProject")}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>
    );
  }

  return (
    <Padding>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Projects</h1>
          <p className="text-muted-foreground">
            Select a project to view and manage its devices
          </p>
        </div>
        <Button onClick={() => pushModal("AddProject")}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project: ProjectEntity) => (
          <a
            key={project.id}
            href={`/${organization.slug || organization.id}/${project.id}/servers/discovery`}
            className="block p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <FolderIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-1">{project.name}</h3>
            {project.domain && (
              <p className="text-sm text-muted-foreground mb-2">
                {project.domain}
              </p>
            )}
            {project.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            )}
            {project.createdAt && (
              <div className="mt-4 text-xs text-muted-foreground">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </div>
            )}
          </a>
        ))}
      </div>
    </Padding>
  );
}
