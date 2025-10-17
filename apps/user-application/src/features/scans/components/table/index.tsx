import { TableSkeleton } from "@/components/ui/table";
import { FullPageEmptyState } from "@/components/shared/full-page-empty-state";
import { GanttChartIcon, Loader2Icon } from "lucide-react";
import { useScansTableQuery } from "@/hooks/useScansTableQuery";

import { ScansDataTable } from "./scans-data-table";
import { useColumns } from "./columns";

// Enhanced types based on our actual orchestration data
type ScanArtifact = {
  id: string;
  runId: string;
  organizationId: string;
  artifactType: string;
  data: {
    // Port scan results
    ports?: Array<{
      port: number;
      protocol: string;
      state: string;
      service?: {
        name?: string;
        product?: string;
        version?: string;
        extraInfo?: string;
      };
      lastSeen?: number;
    }>;

    // OS Detection results
    osInfo?: {
      matches: Array<{
        name: string;
        type: string;
        family: string;
        vendor: string;
        accuracy: number;
        generation: string;
      }>;
      fingerprints?: any[];
    };

    // Enhanced timing and statistics from runStats
    runStats?: {
      finished: {
        time: number;
        timeStr: string;
        summary: string;
        elapsed: number;
        exit: string;
      };
      hosts: {
        up: number;
        down: number;
        total: number;
      };
    };

    // Quality metrics
    quality?: {
      hasRetries: boolean;
      isRealTime: boolean;
      hasTimeouts: boolean;
      scanReliability: number;
      dataCompleteness: number;
      hasFilteredPorts: boolean;
    };

    // Statistics breakdown
    statistics?: {
      tcpPorts: number;
      udpPorts: number;
      openPorts: number;
      totalPorts: number;
      closedPorts: number;
      filteredPorts: number;
      servicesIdentified: number;
      servicesWithVersion: number;
    };

    // Device information
    deviceInfo?: {
      scope: string;
      hostnames: string[];
      ipAddress: string;
      isNewDevice: boolean;
    };

    // Scan context for traceability
    scanContext?: {
      target: string;
      scanId: string;
      userId: string;
      tenantId: string;
      scanRunId: string;
      workflowId: string;
      authScanType: string;
      isExtendScan: boolean;
    };

    // Scan metadata
    scanMetadata?: {
      command: string;
      endTime: number;
      scanner: string;
      version: string;
      duration: number;
      startTime: number;
    };

    // Additional fields for extensibility
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown> | null;
  storageUrl?: string | null;
  checksum?: string | null;
  createdAt: Date;
};

export type Scan = {
  id: string;
  workflowId: string;
  organizationId: string;
  scope: "INTERNAL" | "EXTERNAL" | "HYBRID";
  scanType: "DISCOVERY" | "PORT" | "WEB" | "ADVANCED";
  target?: string | null; // Primary target being scanned
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
  resultSummary?: Record<string, unknown> | null;
  artifacts: ScanArtifact[];
  scanCount?: number;
};

type ScansResponse = {
  success: boolean;
  data: Scan[];
  error?: string;
};

interface ScansTableProps {
  initialData?: ScansResponse;
}

export const ScansTable = ({ initialData }: ScansTableProps) => {
  const columns = useColumns();

  const {
    data: response,
    isLoading,
    error,
    isRefetching,
  } = useScansTableQuery(initialData) as { data: ScansResponse | undefined; isLoading: boolean; error: unknown; isRefetching: boolean };

  const hasServerData =
    response?.success &&
    Array.isArray(response.data) &&
    response.data.length > 0;
  const data: Scan[] = hasServerData ? (response.data as Scan[]) : [];


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
