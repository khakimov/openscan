"use client";

import { type TransformedDevice } from "@repo/contracts/device";
import { format } from "date-fns";
import {
  getRiskLevelBadgeClass,
  getDeviceStatusBadgeClass,
  getTagBadgeClass,
  getRiskLevelBorderClass,
} from "@repo/constants";
import { CardActions, CardActionsItem } from "@/components/shared/card";
import {
  Pencil,
  Trash,
  Radar,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield,
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
import { useEffect, useRef } from "react";

interface DeviceCardProps {
  device: TransformedDevice;
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

export function DeviceCard({ device, isNewlyAdded = false }: DeviceCardProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  // Query active scans directly (auto-polls every 30s while scans exist)
  const { data: activeScans = [] } = useQuery({
    ...trpc.device.activeScans.queryOptions({ deviceId: device.id }),
    queryFn: () => trpcClient.device.activeScans.query({ deviceId: device.id }),
  });
  const isScanning = activeScans.length > 0;

  // Side effect: Invalidate device queries when scan completes (transition detection)
  // This is a legitimate useEffect per TanStack docs - external side effect for cache invalidation
  const prevActiveScanCount = useRef(activeScans.length);
  useEffect(() => {
    const hadScans = prevActiveScanCount.current > 0;
    const nowHasScans = activeScans.length > 0;

    // Detect completion: had scans → no scans
    if (hadScans && !nowHasScans) {
      console.log('🔄 Scan completed - invalidating device queries', { deviceId: device.id });
      // Invalidate device queries using tRPC-compatible keys
      queryClient.invalidateQueries({ queryKey: deviceQueries.detail.key(device.id) });
      queryClient.invalidateQueries({ queryKey: deviceQueries.list.base });
    }

    prevActiveScanCount.current = activeScans.length;
  }, [activeScans.length, device.id, queryClient]);

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

  // Fetch scan history for chart using tRPC
  const { data: scanHistoryData } = useQuery({
    ...trpc.device.scanHistory.queryOptions({ deviceId: device.id, limit: 10 }),
    queryFn: () => trpcClient.device.scanHistory.query({ deviceId: device.id, limit: 10 }),
    enabled: totalScans > 1, // Only fetch if device has scan history
  });

  const scanHistory = scanHistoryData?.history || [];

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
        className={`relative rounded-lg w-full transition-all hover:-translate-y-0.5 border ${!isActivelyScanning && !isNewlyAdded ? getRiskLevelBorderClass(device.riskLevel) : 'border-transparent'}`}
        style={{
          backgroundColor: '#262626'
        }}
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
        <div className="flex gap-2 mt-2">
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

          {/* Status & Risk - only show if scanned */}
          {device.isScanned && (
            <>
              <span className={getDeviceStatusBadgeClass(device.status)}>
                {device.status}
              </span>
              <span className={getRiskLevelBadgeClass(device.riskLevel)}>
                {device.riskLevel}
              </span>
            </>
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

      {/* Scan Chart */}
      {totalScans > 1 && scanHistory.length > 0 && (
        <div className="p-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Ports Activity</div>
            <div className="text-xs text-muted-foreground">
              {scanHistory.length} {scanHistory.length === 1 ? "scan" : "scans"}
            </div>
          </div>
          <DeviceScanChart scanHistory={scanHistory} className="h-12" />
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
      <CardActions>
        <CardActionsItem className="w-full text-blue-600" asChild>
          <button
            type="button"
            onClick={handleScan}
            disabled={isActivelyScanning}
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
        </CardActionsItem>

        <CardActionsItem className="w-full" asChild>
          <button
            type="button"
            onClick={() =>
              pushModal("EditDevice", { deviceId: device.id, device })
            }
          >
            <Pencil size={16} />
            Edit
          </button>
        </CardActionsItem>

        {device.verificationStatus !== "VERIFIED" && (
          <CardActionsItem className="w-full text-green-600" asChild>
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
          </CardActionsItem>
        )}

        {device.verificationStatus === "VERIFIED" && (
          <CardActionsItem className="w-full text-gray-600" asChild>
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
          </CardActionsItem>
        )}

        {device.verificationStatus === "CANDIDATE" && (
          <CardActionsItem className="w-full text-orange-600" asChild>
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
          </CardActionsItem>
        )}

        <CardActionsItem className="w-full text-destructive" asChild>
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
        </CardActionsItem>
      </CardActions>
      </div>
    </div>
  );
}
