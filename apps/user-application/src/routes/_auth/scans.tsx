import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { ScansTable } from "@/features/scans";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { scanQueries } from "@/queries/scan-queries";
import { Spinner } from "@/components/ui/spinner";
import { InlineRouterSpinner } from "@/components/ui/inline-router-spinner";

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
  // Show spinner during slow navigation (only visible if loader takes >1s)
  pendingComponent: () => (
    <div className="flex items-center justify-center h-64">
      <Spinner size="lg" />
    </div>
  ),
  component: Scans,
});

function Scans() {
  const { tab } = Route.useSearch();

  return (
    <Padding>
      <div className="mb-4 flex items-center gap-3">
        <PageTabs>
          <PageTabsLink href={"?tab=all"} isActive={tab === "all"}>
            Scans
          </PageTabsLink>
        </PageTabs>
        {/* Hidden on mobile (shows in sidebar instead) */}
        <InlineRouterSpinner className="hidden lg:inline-flex" />
      </div>

      <div className="grid grid-cols-6 gap-4  pt-0">
        <div className="col-span-6">
          <ScansTable />
        </div>
      </div>
    </Padding>
  );
}
