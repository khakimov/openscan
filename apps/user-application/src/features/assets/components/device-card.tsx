import { type TransformedDevice } from "@/server/devices";
import type { PortScanInput } from "@repo/contracts";
import { format } from "date-fns";
import {
  getRiskLevelBadgeClass,
  getDeviceStatusBadgeClass,
  getTagBadgeClass,
  getRiskLevelBorderClass,
} from "@repo/constants";
import { Card, CardActions, CardActionsItem } from "@/components/shared/card";
import { Pencil, Trash, Radar, Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { pushModal } from "@/modals";
import { toast } from "sonner";
import { useDeviceScan } from "@/hooks/useDeviceScanStatus";
import { DeviceScanChart, type ScanHistoryItem } from "@/components/shared/device-scan-chart";
import { getDeviceScanHistoryData, verifyDevice, toggleDeviceVerification } from "@/server/devices";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface DeviceCardProps {
  device: TransformedDevice;
}

function StatusBadge({ status }: { status: string }) {
  const displayStatus = status || "Unknown";
  return (
    <span className={getDeviceStatusBadgeClass(displayStatus)}>
      {displayStatus}
    </span>
  );
}

function ScanStatusBadge({
  isScanned,
  isScanning,
}: {
  isScanned?: boolean;
  isScanning?: boolean;
}) {
  if (isScanning) {
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Scanning
      </span>
    );
  } else if (isScanned === true) {
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
        Scanned
      </span>
    );
  } else if (isScanned === false) {
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
        Discovered
      </span>
    );
  } else {
    return null;
  }
}

function RiskLevelBadge({ riskLevel }: { riskLevel: string }) {
  const displayLevel = riskLevel || "Unknown";
  return (
    <span className={getRiskLevelBadgeClass(displayLevel)}>{displayLevel}</span>
  );
}

export function DeviceCard({ device }: DeviceCardProps) {
  const queryClient = useQueryClient();
  const {
    scanState,
    isScanning,
    isCompleted,
    isFailed,
    progress,
    progressMessage,
    startScan,
    isStartingScan,
    activeWorkflowId,
  } = useDeviceScan(device.id);

  // Verification mutation
  const verificationMutation = useMutation({
    mutationFn: (data: { deviceId: string; status: 'VERIFIED' | 'EXCLUDED' | 'CANDIDATE'; note?: string }) =>
      verifyDevice({ data }),
    onSuccess: (result, variables) => {
      const statusLabels = {
        VERIFIED: 'verified',
        EXCLUDED: 'excluded',
        CANDIDATE: 'reset to candidate'
      };
      toast.success(`Device ${statusLabels[variables.status]}`, {
        description: `${device.name} has been ${statusLabels[variables.status]}`
      });
      // Invalidate devices query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error) => {
      toast.error('Failed to update device verification', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  const scanStats = device.scanStats;
  const legacyPortCount = (() => {
    if (!device.ports) return 0;
    const tcpPorts = Array.isArray(device.ports.tcp)
      ? device.ports.tcp.length
      : 0;
    // Only TCP ports are supported in the current schema
    return tcpPorts;
  })();
  const totalOpenPorts =
    scanStats?.openPortCount ?? device.totalOpenPorts ?? legacyPortCount;
  const totalScans =
    scanStats?.totalScans ?? device.scanCount ?? (device.isScanned ? 1 : 0);
  const hasScanHistory = totalScans > 0;
  const lastScanAt = scanStats?.lastScanAt ?? device.lastScanned ?? undefined;
  const scanCountLabel = hasScanHistory
    ? `${totalScans} ${totalScans === 1 ? "scan" : "scans"} total`
    : null;

  // Fetch scan history for the chart
  const { data: scanHistoryData } = useQuery({
    queryKey: ['device-scan-history', device.name],
    queryFn: () => getDeviceScanHistoryData({
      data: { target: device.name, limit: 10 }
    }),
    enabled: totalScans > 1, // Only fetch if there are multiple scans
  });

  const scanHistory: ScanHistoryItem[] = scanHistoryData?.history || [];

  const handleDelete = () => {
    pushModal("DeleteDeviceConfirm", {
      deviceId: device.id,
      deviceName: device.name,
    });
  };

  const handleEdit = () => {
    pushModal("EditDevice", {
      deviceId: device.id,
      device: device,
    });
  };

  const runPortScan = async (extend: boolean) => {
    let target = device.name;
    if (target && target.includes("(")) {
      target = target.split("(")[0].trim();
    }

    if (!target || !target.includes(".")) {
      target = device.ip;
    }

    if (!target) {
      toast.error("No valid target found for scanning");
      return;
    }

    const toastId = `${extend ? "extend-scan" : "scan"}-${device.id}`;

    toast.loading(
      `Starting ${extend ? "extended " : ""}port scan for ${target}...`,
      { id: toastId },
    );

    const payload: PortScanInput = {
      target,
      deviceId: device.id,
      protocol: "tcp",
      timeout: extend ? 300000 : 30000,
      isExtendScan: extend,
    };

    if (extend) {
      payload.mode = "EXTEND";
      payload.scanProfile = "PS_L5";
      payload.aggressive = true;
      // Scan full TCP range 1-65535
      payload.additionalPortRanges = ["1-65535"];
    }

    try {
      const result = await startScan(payload);

      if (result.success) {
        toast.success(
          `${extend ? "Extended " : ""}port scan started for ${target}`,
          {
            id: toastId,
            description: `Workflow ID: ${result.workflowId}`,
            action: {
              label: "Monitor",
              onClick: () => {
                console.log("Monitor workflow:", result.workflowId);
              },
            },
          },
        );
      } else {
        toast.error(
          `Failed to start ${extend ? "extended " : ""}scan: ${result.error}`,
          {
            id: toastId,
          },
        );
      }
    } catch (error) {
      toast.error(`Failed to start ${extend ? "extended " : ""}port scan`, {
        id: toastId,
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleExtendedScan = async () => {
    await runPortScan(true);
  };

  // Verification toggle mutation (with scheduling)
  const verificationToggleMutation = useMutation({
    mutationFn: (data: { deviceId: string; verify: boolean; interval?: string }) =>
      toggleDeviceVerification({ data }),
    onSuccess: (result) => {
      toast.success(result.message || 'Device verification updated');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error) => {
      toast.error('Failed to update device verification', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const handleVerify = () => {
    // TODO: Add dialog for interval selection
    verificationToggleMutation.mutate({
      deviceId: device.id,
      verify: true,
      interval: '1h' // Default: hourly
    });
  };

  const handleExclude = () => {
    verificationMutation.mutate({
      deviceId: device.id,
      status: 'EXCLUDED',
      note: 'Manually excluded from device card'
    });
  };

  const handleUnverify = () => {
    verificationToggleMutation.mutate({
      deviceId: device.id,
      verify: false
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    try {
      return format(new Date(dateString), "MMM dd, yyyy");
    } catch {
      return "Invalid date";
    }
  };

  // Get status from status field (already transformed to "active" or "offline")
  const getStatus = () => {
    return device.status || "unknown";
  };

  return (
    <Card
      hover
      className={`${getRiskLevelBorderClass(device.riskLevel)} ${isScanning ? "scanning-border" : ""}`}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="col min-w-0 flex-1 pr-10">
            <div className="font-medium leading-[28px] truncate">
              {device.name}
            </div>
            <div className="text-sm text-muted-foreground">{device.ip}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <ScanStatusBadge
            isScanned={device.isScanned}
            isScanning={isScanning}
          />
          <StatusBadge status={getStatus()} />
          <RiskLevelBadge riskLevel={device.riskLevel} />
        </div>
      </div>
      <div className="row border-y">
        <div className="center-center col flex-1 p-4 py-2 border-r">
          <div className="font-medium text-xl font-mono">{totalOpenPorts}</div>
          <div className="text-muted-foreground whitespace-nowrap text-sm">
            open ports
          </div>
        </div>
        <div className="center-center col flex-1 p-4 py-2 border-r">
          <div className="font-medium text-sm">
            {hasScanHistory
              ? lastScanAt
                ? formatDate(lastScanAt)
                : "Unknown"
              : "Not scanned yet"}
          </div>
          <div className="text-muted-foreground whitespace-nowrap text-sm">
            {hasScanHistory
              ? scanCountLabel
                ? `last scan (${scanCountLabel})`
                : "last scan"
              : "scan status"}
          </div>
        </div>

        <div className="center-center col flex-1 p-4 py-2">
          <div className="font-medium text-sm">
            {formatDate(device.discoveredOn)}
          </div>
          <div className="text-muted-foreground whitespace-nowrap text-sm">
            discovered
          </div>
        </div>
      </div>

      {totalScans > 1 && scanHistory.length > 0 && (
        <div className="border-t">
          <div className="p-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Scan Activity</div>
              <div className="text-xs text-muted-foreground">
                {scanHistory.length} {scanHistory.length === 1 ? "scan" : "scans"}
              </div>
            </div>
            <DeviceScanChart
              scanHistory={scanHistory}
              className="h-12"
            />
          </div>
        </div>
      )}

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
      <CardActions>
        <CardActionsItem className="w-full text-blue-600" asChild>
          <button
            type="button"
            onClick={handleExtendedScan}
            disabled={isScanning || isStartingScan}
            className={
              isScanning || isStartingScan
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          >
            {isStartingScan ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Radar size={16} />
            )}
            {isScanning ? "Scanning..." : "Scan"}
          </button>
        </CardActionsItem>
        <CardActionsItem className="w-full" asChild>
          <button type="button" onClick={handleEdit}>
            <Pencil size={16} />
            Edit
          </button>
        </CardActionsItem>

        {/* Verification Actions - contextual based on current status */}
        {device.verificationStatus !== 'VERIFIED' && (
          <CardActionsItem className="w-full text-green-600" asChild>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verificationToggleMutation.isPending}
            >
              <CheckCircle2 size={16} />
              Verify & Monitor
            </button>
          </CardActionsItem>
        )}

        {device.verificationStatus === 'VERIFIED' && (
          <CardActionsItem className="w-full text-gray-600" asChild>
            <button
              type="button"
              onClick={handleUnverify}
              disabled={verificationToggleMutation.isPending}
            >
              <XCircle size={16} />
              Unverify (Stop Monitoring)
            </button>
          </CardActionsItem>
        )}

        {device.verificationStatus !== 'EXCLUDED' && device.verificationStatus !== 'VERIFIED' && (
          <CardActionsItem className="w-full text-orange-600" asChild>
            <button
              type="button"
              onClick={handleExclude}
              disabled={verificationMutation.isPending}
            >
              <XCircle size={16} />
              Exclude Device
            </button>
          </CardActionsItem>
        )}

        <CardActionsItem className="w-full text-destructive" asChild>
          <button type="button" onClick={handleDelete}>
            <Trash size={16} />
            Delete
          </button>
        </CardActionsItem>
      </CardActions>
    </Card>
  );
}
