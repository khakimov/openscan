import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { Padding } from "@/components/ui/padding";
import { PageTabs, PageTabsLink } from "@/components/navigation/page-tabs";
import { Button } from "@/components/ui/button";
import { PlusIcon, SearchIcon, FilterIcon } from "lucide-react";
import { pushModal } from "@/modals";
import { TableButtons } from "@/components/shared/data-table";
import { ScansTable } from "@/features/scans";

export const Route = createFileRoute("/_auth/scans")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "all",
    };
  },
  component: Scans,
});

function Scans() {
  const { tab } = Route.useSearch();

  const handleStartDiscovery = () => {
    pushModal("AddDiscovery");
  };

  return (
    <Padding>
      <div className="mb-4">
        <PageTabs>
          <PageTabsLink href={"?tab=all"} isActive={tab === "all"}>
            Scans
          </PageTabsLink>
        </PageTabs>
      </div>
      <TableButtons></TableButtons>

      <div className="grid grid-cols-6 gap-4  pt-0">
        <div className="col-span-6">
          <ScansTable />
        </div>
      </div>
    </Padding>
  );
}
