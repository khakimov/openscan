import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPCClient } from '@/integrations/trpc/react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/trpc/router';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProjectListByOrgOutput = RouterOutputs['project']['listByOrg'];
type ProjectListItem = ProjectListByOrgOutput[number];

export const Route = createFileRoute('/_app/$organizationId/dashboard')({
  component: Dashboard,
});

function Dashboard() {
  const { organizationId } = Route.useParams();
  const trpcClient = useTRPCClient();

  const { data: projects } = useSuspenseQuery<ProjectListByOrgOutput>({
    queryKey: ['project', 'listByOrg', organizationId] as const,
    queryFn: () =>
      trpcClient.project.listByOrg.query({
        organizationId,
      }),
  });

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Welcome to your organization dashboard
      </p>

      {/* Project Selector */}
      {projects.length > 0 ? (
        <div>
          <h2 className="text-xl font-semibold mb-4">Your Projects</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project: ProjectListItem) => (
              <Link
                key={project.id}
                to="/$organizationId/$projectId"
                params={{
                  organizationId,
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
