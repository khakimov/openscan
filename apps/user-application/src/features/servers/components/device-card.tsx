"use client";

import { type TransformedDevice } from "@repo/contracts/device";
import { format } from "date-fns";
import {
  getRiskLevelBadgeClass,
  getDeviceStatusBadgeClass,
  getTagBadgeClass,
  getRiskLevelBorderClass,
} from "@repo/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Trash,
  Radar,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
  Bug,
  MoreHorizontal,
} from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { DeviceScanChart } from "@/components/shared/device-scan-chart";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/integrations/trpc/react";
import {
  useVerifyDeviceMutation,
  useToggleDeviceVerificationMutation,
  useStartDeviceScanMutation,
  deviceQueries,
} from "@/queries/device-queries";
import { invalidateTRPCQuery } from "@/lib/query-utils";
import { useDeviceActiveScans, useDeviceList } from "@/features/servers/context/device-list-context";
import { useEffect, useRef, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ScanHistoryItem = {
  id: string;
  deviceId: string;
  completedAt: string | null;
  portCount?: number;
};

interface DeviceCardProps {
  device: TransformedDevice & {
    scanHistory?: ScanHistoryItem[]; // Optional - will poll if not provided
  };
  isNewlyAdded?: boolean; // Visual indicator for newly added devices
}

// Helper to get scan target from device
function getScanTarget(device: TransformedDevice): string | null {
  let target = device.name;

  // Clean up name with parentheses
  if (target?.includes("(")) {
    target = target.split("(")[0].trim();
  }

  // Use IP if name doesn't look like a hostname
  if (!target || !target.includes(".")) {
    target = device.ip;
  }

  return target || null;
}

// Aggregate CVE counts from port snapshots
function aggregateCVECounts(portSnapshots: TransformedDevice["portSnapshots"]): {
  totalCves: number;
  criticalCount: number;
  highCount: number;
  maxCvssScore: number | undefined;
} {
  if (!portSnapshots || portSnapshots.length === 0) {
    return { totalCves: 0, criticalCount: 0, highCount: 0, maxCvssScore: undefined };
  }

  let totalCves = 0;
  let criticalCount = 0;
  let highCount = 0;
  let maxCvssScore: number | undefined;

  for (const port of portSnapshots) {
    if (port.enrichment?.summary) {
      totalCves += port.enrichment.summary.cveCount ?? 0;
      criticalCount += port.enrichment.summary.criticalCount ?? 0;
      highCount += port.enrichment.summary.highCount ?? 0;
      if (port.enrichment.summary.maxCvssScore !== undefined) {
        maxCvssScore = maxCvssScore === undefined
          ? port.enrichment.summary.maxCvssScore
          : Math.max(maxCvssScore, port.enrichment.summary.maxCvssScore);
      }
    }
  }

  return { totalCves, criticalCount, highCount, maxCvssScore };
}

// Risk level descriptions for tooltip
const RISK_LEVEL_DESCRIPTIONS: Record<string, string> = {
  CRITICAL: "Critical vulnerabilities detected - immediate action required",
  HIGH: "High-severity issues found - prioritize remediation",
  MEDIUM: "Moderate risk - review and address when possible",
  LOW: "Low risk - minor issues that should be monitored",
  SECURE: "No significant vulnerabilities detected",
  UNKNOWN: "Not yet scanned - run a scan to assess risk",
};

export function DeviceCard({ device, isNewlyAdded = false }: DeviceCardProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Use active scans from DeviceListContext (fetched in bulk by parent)
  // This eliminates N+1 queries - all devices' active scans come from single parent query
  const { activeScans } = useDeviceActiveScans(device.id);
  const { refresh } = useDeviceList();

  const isScanning = activeScans.length > 0;

  // Side effect: Refresh device list when THIS device's scan completes
  // Parent's polling will pick up new scans, but we help by refreshing when we detect completion
  const prevActiveScanCount = useRef(activeScans.length);
  useEffect(() => {
    const hadScans = prevActiveScanCount.current > 0;
    const nowHasScans = activeScans.length > 0;

    // Detect completion: had scans → no scans
    if (hadScans && !nowHasScans) {
      // Refresh the device list to get fresh scan results
      void refresh();
      // Also invalidate device detail queries
      queryClient.invalidateQueries({ queryKey: deviceQueries.detail.key(device.id) });
      queryClient.invalidateQueries(invalidateTRPCQuery(deviceQueries.list.base));
    }

    prevActiveScanCount.current = activeScans.length;
  }, [activeScans.length, device.id, queryClient, refresh]);

  // Scan mutation (using centralized hook)
  const scanMutation = useStartDeviceScanMutation(device.id);

  // Show scanning state: database scan OR optimistic mutation state
  const isActivelyScanning = isScanning || scanMutation.isPending;

  // Simplified stats - trust server data
  // Show services detected (with actual service info) instead of raw port count
  const servicesDetected = device.scanStats?.portScanStats?.portsStored ?? 0;
  const totalScans = device.scanStats?.totalScans ?? 0;
  const lastScanAt = device.scanStats?.lastScanAt;
  const hasScanHistory = totalScans > 0;

  // Aggregate CVE counts from port snapshots
  const cveStats = useMemo(
    () => aggregateCVECounts(device.portSnapshots),
    [device.portSnapshots]
  );

  // Use pre-fetched scan history from device.listWithDetails (if available)
  // Otherwise fall back to individual query
  const shouldFetchHistory = !device.scanHistory && totalScans > 1;
  const { data: queriedHistoryData } = useQuery({
    ...trpc.device.scanHistory.queryOptions({ deviceId: device.id, limit: 10 }),
    queryFn: () => trpcClient.device.scanHistory.query({ deviceId: device.id, limit: 10 }),
    enabled: shouldFetchHistory, // Only fetch if not pre-fetched and device has history
  });

  const scanHistory = device.scanHistory ?? queriedHistoryData?.history ?? [];

  // Mutations (using centralized hooks)
  const verificationMutation = useVerifyDeviceMutation();
  const verificationToggleMutation = useToggleDeviceVerificationMutation();

  // Handlers
  const handleScan = () => {
    const target = getScanTarget(device);
    if (!target) {
      toast.error("No valid target found for scanning");
      return;
    }

    // Optimistic update: scanMutation.isPending immediately becomes true
    // UI shows "Scanning..." and animated border right away
    const toastId = `scan-${device.id}`;
    toast.loading(`Starting scan for ${target}...`, { id: toastId });

    scanMutation.mutate(
      { deviceId: device.id, target, preset: "THOROUGH" },
      {
        onSuccess: (result) => {
          if (result.success && result.scanId) {
            toast.success(`Scan started for ${result.target}`, {
              id: toastId,
              description: result.presetDescription || `Scan ID: ${result.scanId}`,
            });
          } else {
            toast.error(`Failed to start scan: ${result.error}`, { id: toastId });
          }
        },
        onError: (error) => {
          toast.error("Failed to start port scan", {
            id: toastId,
            description: error instanceof Error ? error.message : "Unknown error",
          });
        },
      }
    );
  };

  return (
    <div
      className={
        isActivelyScanning
          ? "animate-rotate-border rounded-lg p-px w-full"
          : isNewlyAdded
            ? "animate-new-device-border rounded-lg p-px w-full"
            : "w-full"
      }
      style={
        isActivelyScanning
          ? {
              background: `conic-gradient(from var(--border-angle), transparent 0%, rgb(59 130 246) 50%, transparent 100%)`
            }
          : isNewlyAdded
            ? {
                background: `conic-gradient(from var(--border-angle), transparent 0%, rgb(34 197 94) 50%, transparent 100%)`
              }
            : undefined
      }
    >
      <div
        className={`relative rounded-lg w-full transition-all hover:-translate-y-0.5 border ${!isActivelyScanning && !isNewlyAdded ? getRiskLevelBorderClass(device.riskLevel) : 'border-transparent'} ${device.isScanned ? 'min-h-[340px]' : ''}`}
        style={{
          backgroundColor: '#262626'
        }}
        data-tour="device-card"
      >
        {/* Header */}
        <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="col min-w-0 flex-1 pr-10">
            <div className="font-medium leading-[28px] truncate">
              {device.name}
            </div>
            <div className="text-sm text-muted-foreground">{device.ip}</div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mt-2">
          {/* Scan Status Badge */}
          {isActivelyScanning ? (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning
            </span>
          ) : device.isScanned ? (
            <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
              Scanned
            </span>
          ) : (
            <span className="px-2 py-1 text-xs rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/30">
              Not Scanned
            </span>
          )}

          {/* Status - only show if offline (warning indicator) */}
          {device.status === 'offline' && (
            <span className={getDeviceStatusBadgeClass(device.status)}>
              {device.status}
            </span>
          )}

          {/* Risk level - only show if scanned */}
          {device.isScanned && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`${getRiskLevelBadgeClass(device.riskLevel)} cursor-help`}>
                  {device.riskLevel}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-sm">
                  {RISK_LEVEL_DESCRIPTIONS[device.riskLevel] || RISK_LEVEL_DESCRIPTIONS.UNKNOWN}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* CVE Count Badge - show if has vulnerabilities */}
          {device.isScanned && cveStats.totalCves > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 cursor-help ${
                  cveStats.criticalCount > 0
                    ? "bg-red-500/10 text-red-400 border border-red-500/30"
                    : cveStats.highCount > 0
                      ? "bg-orange-500/10 text-orange-400 border border-orange-500/30"
                      : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30"
                }`}>
                  <Bug className="w-3 h-3" />
                  {cveStats.totalCves} CVE{cveStats.totalCves !== 1 ? "s" : ""}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="text-sm space-y-1">
                  <p className="font-medium">{cveStats.totalCves} vulnerabilities detected</p>
                  {cveStats.criticalCount > 0 && (
                    <p className="text-red-400">{cveStats.criticalCount} critical</p>
                  )}
                  {cveStats.highCount > 0 && (
                    <p className="text-orange-400">{cveStats.highCount} high</p>
                  )}
                  {cveStats.maxCvssScore !== undefined && (
                    <p className="text-muted-foreground">Max CVSS: {cveStats.maxCvssScore.toFixed(1)}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {/* WAF/Proxy Pattern Badge */}
          {device.scanStats?.portScanStats?.scanPattern &&
            device.scanStats.portScanStats.scanPattern.includes('WAF/Proxy') && (
            <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Shield className="w-3 h-3" />
              {device.scanStats.portScanStats.scanPattern}
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 items-start gap-x-6 gap-y-1 p-4 sm:p-6">
        <div className="text-sm text-muted-foreground">services</div>
        <div className="text-sm text-muted-foreground">
          {hasScanHistory ? "last scan" : "scan status"}
        </div>
        <div className="text-sm text-muted-foreground">discovered</div>

        <div className="font-mono text-xl px-2">
          {device.isScanned ? servicesDetected : "-"}
        </div>
        <div className="text-sm whitespace-nowrap">
          {hasScanHistory && lastScanAt
            ? format(new Date(lastScanAt), "MMM dd, yyyy")
            : hasScanHistory
              ? "Unknown"
              : "Not scanned yet"}
        </div>
        <div className="text-sm whitespace-nowrap">
          {device.discoveredOn
            ? format(new Date(device.discoveredOn), "MMM dd, yyyy")
            : "Unknown"}
        </div>

        {hasScanHistory && totalScans > 0 && (
          <div className="col-start-2 row-start-3 text-xs text-muted-foreground">
            ({totalScans} {totalScans === 1 ? "scan" : "scans"} total)
          </div>
        )}
      </div>

      {/* Scan Chart - show when 2+ scans, or placeholder for scanned devices */}
      {device.isScanned && (
        <div className="p-4 py-3">
          {totalScans > 1 && scanHistory.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Ports Activity</div>
                <div className="text-xs text-muted-foreground">
                  {scanHistory.length} {scanHistory.length === 1 ? "scan" : "scans"}
                </div>
              </div>
              <DeviceScanChart scanHistory={scanHistory} className="h-12" />
            </>
          ) : (
            <div className="h-12 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">
                {totalScans === 1 ? "Run another scan to see activity chart" : "No scan history yet"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {device.tags && device.tags.length > 0 && (
        <div className="p-4 pt-2">
          <div className="flex flex-wrap gap-1">
            {device.tags.map((tag, index) => (
              <span key={index} className={getTagBadgeClass()}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        className="absolute right-2 top-2 z-10"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-8 w-8 items-center justify-center rounded hover:border focus:outline-none focus:ring-0 focus:border-transparent"
            data-tour="card-menu-trigger"
          >
            <MoreHorizontal size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuGroup>
              <DropdownMenuItem className="w-full text-blue-600" asChild>
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={isActivelyScanning}
                  data-tour="scan-btn"
                  className={
                    isActivelyScanning
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                >
                  {scanMutation.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Radar size={16} />
                  )}
                  {isActivelyScanning ? "Scanning..." : "Scan"}
                </button>
              </DropdownMenuItem>

              <DropdownMenuItem className="w-full" asChild>
                <button
                  type="button"
                  onClick={() =>
                    pushModal("EditDevice", { deviceId: device.id, device })
                  }
                >
                  <Pencil size={16} />
                  Edit
                </button>
              </DropdownMenuItem>

              {device.verificationStatus !== "VERIFIED" && (
                <DropdownMenuItem className="w-full text-green-600" asChild>
                  <button
                    type="button"
                    onClick={() =>
                      verificationToggleMutation.mutate(
                        {
                          deviceId: device.id,
                          verify: true,
                          interval: "1h",
                        },
                        {
                          onSuccess: (result) => {
                            toast.success(result.message || "Device verification updated");
                          },
                          onError: (error) => {
                            toast.error("Failed to update device", {
                              description: error instanceof Error ? error.message : "Unknown error",
                            });
                          },
                        }
                      )
                    }
                    disabled={verificationToggleMutation.isPending}
                  >
                    <CheckCircle2 size={16} />
                    Verify & Monitor
                  </button>
                </DropdownMenuItem>
              )}

              {device.verificationStatus === "VERIFIED" && (
                <DropdownMenuItem className="w-full text-gray-600" asChild>
                  <button
                    type="button"
                    onClick={() =>
                      verificationToggleMutation.mutate(
                        {
                          deviceId: device.id,
                          verify: false,
                        },
                        {
                          onSuccess: (result) => {
                            toast.success(result.message || "Device verification updated");
                          },
                          onError: (error) => {
                            toast.error("Failed to update device", {
                              description: error instanceof Error ? error.message : "Unknown error",
                            });
                          },
                        }
                      )
                    }
                    disabled={verificationToggleMutation.isPending}
                  >
                    <XCircle size={16} />
                    Unverify (Stop Monitoring)
                  </button>
                </DropdownMenuItem>
              )}

              {device.verificationStatus === "CANDIDATE" && (
                <DropdownMenuItem className="w-full text-orange-600" asChild>
                  <button
                    type="button"
                    onClick={() =>
                      verificationMutation.mutate(
                        {
                          deviceId: device.id,
                          status: "EXCLUDED",
                          note: "Manually excluded",
                        },
                        {
                          onSuccess: (_result, variables) => {
                            const labels = {
                              VERIFIED: "verified",
                              EXCLUDED: "excluded",
                              CANDIDATE: "reset to candidate",
                            };
                            toast.success(`Device ${labels[variables.status]}`);
                          },
                          onError: (error) => {
                            toast.error("Failed to update device", {
                              description: error instanceof Error ? error.message : "Unknown error",
                            });
                          },
                        }
                      )
                    }
                    disabled={verificationMutation.isPending}
                  >
                    <XCircle size={16} />
                    Exclude Device
                  </button>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem className="w-full text-destructive" asChild>
                <button
                  type="button"
                  onClick={() =>
                    pushModal("DeleteDeviceConfirm", {
                      deviceId: device.id,
                      deviceName: device.name,
                    })
                  }
                >
                  <Trash size={16} />
                  Delete
                </button>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </div>
  );
}
