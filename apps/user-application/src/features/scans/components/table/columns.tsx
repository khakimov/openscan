import { useMemo } from "react";
import type React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  ServerIcon,
  NetworkIcon,
  ClockIcon,
  TargetIcon,
  LoaderIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { Scan } from "./index";
import { derivePortStats } from "@repo/data-ops";

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "MMM d, yyyy HH:mm");
}

type BadgeVariant = "default" | "destructive" | "outline" | "secondary";

function getStatusDisplay(scan: Scan): {
  label: string;
  variant: BadgeVariant;
  icon: React.ReactNode;
  description: string;
} {
  switch (scan.status) {
    case "PENDING":
      return {
        label: "Pending",
        variant: "secondary" as const,
        icon: <ClockIcon className="w-3 h-3" />,
        description: "Waiting to start",
      };

    case "RUNNING":
      const elapsed = scan.startedAt
        ? Math.floor((Date.now() - new Date(scan.startedAt).getTime()) / 1000)
        : 0;
      return {
        label: "Running",
        variant: "default" as const,
        icon: <LoaderIcon className="w-3 h-3 animate-spin" />,
        description: elapsed > 0 ? `${elapsed}s elapsed` : "Starting...",
      };

    case "SUCCEEDED":
      const duration =
        scan.startedAt && scan.completedAt
          ? Math.floor(
              (new Date(scan.completedAt).getTime() -
                new Date(scan.startedAt).getTime()) /
                1000,
            )
          : null;
      return {
        label: "Complete",
        variant: "secondary" as const,
        icon: <CheckIcon className="w-3 h-3" />,
        description: duration ? `${duration}s` : "Completed",
      };

    case "FAILED":
      return {
        label: "Failed",
        variant: "destructive" as const,
        icon: <XIcon className="w-3 h-3" />,
        description:
          (scan.resultSummary as any)?.error?.message || "Scan failed",
      };

    case "CANCELED":
      return {
        label: "Canceled",
        variant: "outline" as const,
        icon: <AlertCircleIcon className="w-3 h-3" />,
        description: "Scan canceled",
      };

    case "TIMEOUT":
      return {
        label: "Timeout",
        variant: "destructive" as const,
        icon: <ClockIcon className="w-3 h-3" />,
        description: "Scan timed out",
      };

    default:
      return {
        label: scan.status,
        variant: "secondary" as const,
        icon: <AlertCircleIcon className="w-3 h-3" />,
        description: scan.status.toLowerCase(),
      };
  }
}

export function useColumns(): ColumnDef<Scan>[] {
  return useMemo<ColumnDef<Scan>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        size: 180,
        cell: ({ row }) => {
          const status = getStatusDisplay(row.original);
          return (
            <div className="flex items-center gap-2">
              <Badge
                variant={status.variant}
                className="flex items-center gap-1"
              >
                {status.icon}
                {status.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {status.description}
              </span>
            </div>
          );
        },
      },
      {
        id: "target",
        header: () => (
          <div className="flex items-center gap-1">
            <TargetIcon className="h-4 w-4" />
            Target
          </div>
        ),
        size: 200,
        cell: ({ row }) => {
          const scan = row.original;
          const target = scan.target || scan.resultSummary?.target || "—";

          return (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-medium">{target}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {scan.scope}
                </Badge>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  {scan.scanType}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "ports",
        header: () => (
          <div className="flex items-center gap-1">
            <NetworkIcon className="h-4 w-4" />
            Ports
          </div>
        ),
        size: 180,
        cell: ({ row }) => {
          const scan = row.original;

          // ✅ Derive port stats from canonical portSnapshots (sec-zg2)
          const portStats = derivePortStats(
            (scan.resultSummary as any)?.portSnapshots,
            (scan.resultSummary as any)?.portScanStats
          );
          const ports = portStats.ports;
          const storedCount = portStats.portsStored ?? ports.length;
          const discoveredCount = portStats.totalOpenPorts;
          const detectionRate = portStats.serviceDetectionRate;

          if (ports.length === 0) {
            if (scan.status === "RUNNING" || scan.status === "PENDING") {
              return (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <LoaderIcon className="w-3 h-3 animate-spin" />
                  <span className="text-sm">Scanning...</span>
                </div>
              );
            }
            if (scan.status === "FAILED") {
              return <span className="text-muted-foreground">Scan failed</span>;
            }
            return <span className="text-muted-foreground">No ports</span>;
          }

          return (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="text-sm font-semibold text-green-600">
                  {storedCount}
                </span>
                <span>stored</span>
                {discoveredCount !== storedCount && (
                  <span>{discoveredCount} discovered</span>
                )}
                {typeof detectionRate === "number" && (
                  <span>
                    {Math.round(detectionRate)}% detection
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {ports.slice(0, 4).map((port, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-xs px-1 py-0"
                  >
                    {port.port}
                  </Badge>
                ))}
                {ports.length > 4 && (
                  <span className="text-xs text-muted-foreground">
                    +{ports.length - 4}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "osDetection",
        header: () => (
          <div className="flex items-center gap-1">
            <ServerIcon className="h-4 w-4" />
            OS Detection
          </div>
        ),
        size: 200,
        cell: ({ row }) => {
          const scan = row.original;
          const osInfo = scan.resultSummary?.osInfo;

          if (!osInfo?.name) {
            if (scan.status === "RUNNING" || scan.status === "PENDING") {
              return (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <LoaderIcon className="w-3 h-3 animate-spin" />
                  <span className="text-sm">Detecting...</span>
                </div>
              );
            }
            return (
              <span className="text-muted-foreground">No OS detected</span>
            );
          }

          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{osInfo.name}</span>
                {osInfo.accuracy && (
                  <Badge variant="outline" className="text-xs">
                    {osInfo.accuracy}%
                  </Badge>
                )}
              </div>
              {osInfo.version && (
                <div className="text-xs text-muted-foreground">
                  {osInfo.version}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "lastScan",
        header: () => (
          <div className="flex items-center gap-1">
            <ClockIcon className="h-4 w-4" />
            Last Scan
          </div>
        ),
        size: 200,
        cell: ({ row }) => {
          const completedAt =
            row.original.completedAt || row.original.startedAt;

          return (
            <span className="font-mono text-sm font-semibold">
              {formatDate(completedAt)}
            </span>
          );
        },
      },
    ],
    [],
  );
}
