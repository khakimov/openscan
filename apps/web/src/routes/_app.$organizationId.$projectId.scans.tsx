import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { ScansTable } from "@/features/scans/components/table";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";


import { OverviewRange } from "@/features/overview/components/overview-range";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";

// Search params schema with proper validation
const scansSearchSchema = z.object({
  tab: fallback(z.enum(["all"]), "all").default("all"),
});

/**
 * Pending component — preserves tabs while parent's beforeLoad resolves
 */
const ScansPending = () => (
  <Padding>
    <div className="mb-4 flex items-center justify-between">
      <PageTabs>
        <PageTabsLink to="." search={{ tab: "all" }}>
          Scans
        </PageTabsLink>
      </PageTabs>
      <OverviewRange />
    </div>
    <PageLoadingFallback compact />
  </Padding>
);

export const Route = createFileRoute("/_app/$organizationId/$projectId/scans")({
  pendingComponent: ScansPending,
  validateSearch: zodValidator(scansSearchSchema),
  component: Scans,
});

function Scans() {
  // ✅ Get project from parent route context (via beforeLoad)
  const { project } = Route.useRouteContext();

  return (
    <Padding>
      {/* Page shell - renders immediately, no data needed */}
      <div className="mb-4 flex items-center justify-between">
        <PageTabs>
          <PageTabsLink to="." search={{ tab: "all" }}>
            Scans
          </PageTabsLink>
        </PageTabs>
        <OverviewRange />
      </div>

      <div className="grid grid-cols-6 gap-4 pt-0">
        <div className="col-span-6">
          <ScansTable projectId={project.id} />
        </div>
      </div>
    </Padding>
  );
}
