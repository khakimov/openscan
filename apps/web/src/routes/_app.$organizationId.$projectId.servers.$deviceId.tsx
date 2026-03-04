import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/integrations/trpc/react";
import { DeviceHeaderSkeleton } from "@/components/shared/skeletons";
import { DeviceActionButtons } from "@/features/servers/components/device-actions";

export const Route = createFileRoute("/_app/$organizationId/$projectId/servers/$deviceId")({
  component: DevicePage,
});

function DevicePage() {
  const { organization, project } = Route.useRouteContext();
  const { deviceId } = Route.useParams();
  const trpc = useTRPC();

  const { data: device, isLoading } = useQuery(
    trpc.device.detail.queryOptions({ deviceId, projectId: project.id })
  );

  const orgParam = organization.slug ?? organization.id;

  return (
    <Padding>
      <div className="mb-4">
        {/* Back button */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/$organizationId/$projectId/servers/verified"
            params={{ organizationId: orgParam, projectId: project.id }}
          >
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Servers
            </Button>
          </Link>
        </div>

        {/* Header */}
        {isLoading || !device ? (
          <DeviceHeaderSkeleton />
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{device.name}</h1>
              <p className="text-muted-foreground mt-1">{device.ip}</p>
            </div>
            <DeviceActionButtons device={device} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-3 mt-6">
          <PageTabs>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Overview
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/scans"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Scans
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/vulnerabilities"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Vulnerabilities
            </PageTabsLink>
            <PageTabsLink
              to="/$organizationId/$projectId/servers/$deviceId/activity"
              params={{ organizationId: orgParam, projectId: project.id, deviceId }}
            >
              Activity
            </PageTabsLink>
          </PageTabs>
        </div>
      </div>

      <Outlet />
    </Padding>
  );
}
