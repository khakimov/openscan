import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { ScansTable } from "@/features/scans";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { scanQueries } from "@/queries/scan-queries";
import { PageLoadingFallback } from "@/components/shared/page-loading-fallback";
import { Suspense } from "react";
import { useProject } from "@/components/layout";

// Search params schema with proper validation
const scansSearchSchema = z.object({
  tab: fallback(z.enum(["all"]), "all").default("all"),
});

/**
 * Pending component for scans route
 * Keeps tabs visible with inline spinner
 */
const ScansPending = () => (
  <Padding>
    <div className="mb-4 flex items-center gap-3">
      <PageTabs>
        <PageTabsLink to="." search={{ tab: "all" }} isActive={true}>
          Scans
        </PageTabsLink>
      </PageTabs>
    </div>
    <PageLoadingFallback compact />
  </Padding>
);

export const Route = createFileRoute("/_app/$organizationId/$projectId/scans")({
  pendingComponent: ScansPending,
  validateSearch: zodValidator(scansSearchSchema),
  loader: async ({ context: { queryClient }, params }) => {
    // Populate query cache for SSR - table() uses auto-polling
    await queryClient.ensureQueryData(
      scanQueries.table({ projectId: params.projectId })
    );
  },
  component: Scans,
});

function Scans() {
  const { tab } = Route.useSearch();
  const project = useProject();

  return (
    <Padding>
      {/* Page shell - renders immediately, no data needed */}
      <div className="mb-4 flex items-center gap-3">
        <PageTabs>
          <PageTabsLink
            to="."
            search={{ tab: "all" }}
            isActive={tab === "all"}
          >
            Scans
          </PageTabsLink>
        </PageTabs>
      </div>

      {/* Data component - only this suspends, page shell stays visible */}
      <div className="grid grid-cols-6 gap-4  pt-0">
        <div className="col-span-6">
          <Suspense fallback={<PageLoadingFallback compact />}>
            <ScansTable projectId={project.id} />
          </Suspense>
        </div>
      </div>
    </Padding>
  );
}
