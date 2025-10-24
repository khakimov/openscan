import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { ScansTable } from "@/features/scans";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { scanQueries } from "@/queries/scan-queries";
import { Spinner } from "@/components/ui/spinner";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";
import { Suspense } from "react";

// Search params schema with proper validation
const scansSearchSchema = z.object({
  tab: fallback(z.enum(["all"]), "all").default("all"),
});

export const Route = createFileRoute("/_auth/scans")({
  validateSearch: zodValidator(scansSearchSchema),
  loader: async ({ context: { queryClient } }) => {
    // Populate query cache for SSR - table() uses auto-polling
    await queryClient.ensureQueryData(scanQueries.table());
  },
  // No pendingComponent - render page shell immediately, suspend only data component
  component: Scans,
});

function Scans() {
  const { tab } = Route.useSearch();

  return (
    <Padding>
      {/* Page shell - renders immediately, no data needed */}
      <div className="mb-4 flex items-center gap-3">
        <PageTabs>
          <PageTabsLink href={"?tab=all"} isActive={tab === "all"}>
            Scans
          </PageTabsLink>
        </PageTabs>
        {/* Hidden on mobile (shows in sidebar instead) */}
        <InlineRouterSpinner className="hidden lg:inline-flex" />
      </div>

      {/* Data component - only this suspends, page shell stays visible */}
      <div className="grid grid-cols-6 gap-4  pt-0">
        <div className="col-span-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
              </div>
            }
          >
            <ScansTable />
          </Suspense>
        </div>
      </div>
    </Padding>
  );
}
