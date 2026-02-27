import { createFileRoute, Link } from '@tanstack/react-router';
import type { ProjectEntity } from '@repo/contracts/project';

export const Route = createFileRoute('/_app/$organizationId/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { organization, projects } = Route.useRouteContext();

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Welcome to your organization dashboard
      </p>

      {projects.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: ProjectEntity) => (
              <Link
                key={project.id}
                to="/$organizationId/$projectId/servers/discovery"
                params={{
                  organizationId: organization.slug || organization.id,
                  projectId: project.id,
                }}
                className="block rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
              >
                <h3 className="font-semibold">{project.name}</h3>
                {project.domain && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {project.domain}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No projects yet. Create your first project to get started.
          </p>
        </div>
      )}
    </div>
  );
}
