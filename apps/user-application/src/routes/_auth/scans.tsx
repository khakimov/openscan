import { createFileRoute } from "@tanstack/react-router";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { ScansTable } from "@/features/scans";
import { getScans } from "@/server/scans";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

// Search params schema with proper validation
const scansSearchSchema = z.object({
  tab: fallback(z.enum(["all"]), "all").default("all"),
});

export const Route = createFileRoute("/_auth/scans")({
  validateSearch: zodValidator(scansSearchSchema),
  loader: async () => {
    // Fetch scans server-side for initial render
    const scansResponse = await getScans();
    return { scansResponse };
  },
  component: Scans,
});

function Scans() {
  const { tab } = Route.useSearch();
  const { scansResponse } = Route.useLoaderData();

  return (
    <Padding>
      <div className="mb-4">
        <PageTabs>
          <PageTabsLink href={"?tab=all"} isActive={tab === "all"}>
            Scans
          </PageTabsLink>
        </PageTabs>
      </div>

      <div className="grid grid-cols-6 gap-4  pt-0">
        <div className="col-span-6">
          <ScansTable initialData={scansResponse as any} />
        </div>
      </div>
    </Padding>
  );
}
