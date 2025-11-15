import { FullPageEmptyState } from "@/components/shared/full-page-empty-state";
import { GanttChartIcon, Loader2Icon } from "lucide-react";
import { useScanList } from "@/queries/scan-queries";

import { ScansDataTable } from "./scans-data-table";
import { useColumns } from "./columns";
import type { PortScanStats, PortSnapshot } from "@repo/data-ops";

// Port scan result summary stored in scanRuns.resultSummary (sec-zg2 schema)
export type PortScanResult = {
  target: string;
  portSnapshots: PortSnapshot[];
  portScanStats?: PortScanStats;
  osInfo?: {
    name?: string;
    version?: string;
    accuracy?: number;
    cpe?: string[];
  };
  timing?: {
    start?: number;
    end?: number;
    elapsed?: number;
  };
  scanMetadata?: {
    scanner?: string;
    version?: string;
    arguments?: string;
    duration?: number;
    resolvedTarget?: string;
  };
  completedAt: string;
  cveEnrichment?: any; // Full CVE enrichment data
};

export type Scan = {
  id: string; // Database CUID (scanRuns.id)
  restateWorkflowId: string; // Restate workflow key
  organizationId: string;
  scope: "INTERNAL" | "EXTERNAL" | "HYBRID";
  scanType: "DISCOVERY" | "PORT" | "WEB" | "ADVANCED";
  target?: string | null;
  status:
    | "PENDING"
    | "RUNNING"
    | "PARTIAL"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELED"
    | "TIMEOUT";
  requestedById?: string | null;
  requestedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  resultSummary?: PortScanResult | null; // Actual scan results
};

interface ScansTableProps {
  projectId?: string;
}

export const ScansTable = ({ projectId }: ScansTableProps) => {
  const columns = useColumns();

  // Use centralized scan list hook (includes auto-polling)
  const {
    data: scans = [],
    isRefetching,
  } = useScanList({ projectId });

  const data: Scan[] = scans as unknown as Scan[];

  if (data.length === 0) {
    return (
      <FullPageEmptyState title="No scans here" icon={GanttChartIcon}>
        <p>Could not find any scans yet</p>
      </FullPageEmptyState>
    );
  }

  return (
    <div className="relative">
      {/* Show subtle indicator during background refetch (polling) */}
      {isRefetching && (
        <div className="absolute top-4 right-4 z-10">
          <div className="flex items-center justify-center w-8 h-8 rounded border bg-background">
            <Loader2Icon className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}
      <ScansDataTable data={data} columns={columns} />
    </div>
  );
};
