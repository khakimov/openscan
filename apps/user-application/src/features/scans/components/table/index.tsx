import { TableSkeleton } from "@/components/ui/table";
import { FullPageEmptyState } from "@/components/shared/full-page-empty-state";
import { GanttChartIcon, Loader2Icon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanQueries } from "@/queries/scan-queries";

import { ScansDataTable } from "./scans-data-table";
import { useColumns } from "./columns";

// Port scan result summary stored in scanRuns.resultSummary
export type PortScanResult = {
  target: string;
  openPortCount: number;
  ports: Array<{
    port: number;
    protocol: string;
    state: string;
    service?: {
      name?: string;
      product?: string | null;
      version?: string | null;
      extraInfo?: string | null;
      method?: string;
      confidence?: number;
    };
  }>;
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
};

export type Scan = {
  id: string; // Database CUID (scanRuns.id)
  scanId: string; // Restate workflow key (scanWorkflows.scanId)
  scanWorkflowId: string; // Database CUID (scanWorkflows.id)
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

interface ScansTableProps {}

export const ScansTable = ({}: ScansTableProps) => {
  const columns = useColumns();

  const {
    data: response,
    isLoading,
    error,
    isRefetching,
  } = useQuery(scanQueries.table());

  const hasServerData =
    response?.success &&
    Array.isArray(response.data) &&
    response.data.length > 0;
  const data: Scan[] = hasServerData ? response.data as unknown as Scan[] : [];


  if (isLoading) {
    return <TableSkeleton />;
  }

  if (error) {
    return (
      <FullPageEmptyState title="Error loading scans" icon={GanttChartIcon}>
        <p>Failed to load scan data. Please try again.</p>
      </FullPageEmptyState>
    );
  }

  if (data.length === 0) {
    return (
      <FullPageEmptyState title="No scans here" icon={GanttChartIcon}>
        <p>Could not find any scans yet</p>
      </FullPageEmptyState>
    );
  }

  return (
    <div className="relative">
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
