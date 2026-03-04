'use client';

import { useMemo, useState } from "react";
import type { TransformedDevice } from "@repo/contracts/device";
import { Loader2 } from "lucide-react";
import { OpenPortsTable } from "./open-ports-table";
import type { PortDetail } from "./types";

interface DeviceOpenPortsProps {
  deviceDetail: TransformedDevice | undefined;
  isLoading: boolean;
}

export function DeviceOpenPorts({
  deviceDetail,
  isLoading,
}: DeviceOpenPortsProps) {
  const [expandedPorts, setExpandedPorts] = useState<Set<string>>(new Set());

  const { openPorts, openPortCount } = useMemo(() => {
    // Single source of truth: portSnapshots from TransformedDevice
    const snapshots = Array.isArray(deviceDetail?.portSnapshots)
      ? (deviceDetail.portSnapshots as PortDetail[])
      : [];

    const portsStored =
      deviceDetail?.scanStats?.portScanStats?.portsStored ??
      snapshots.length;

    return {
      openPorts: snapshots,
      openPortCount: portsStored,
    };
  }, [deviceDetail]);

  const togglePortExpanded = (portKey: string) => {
    setExpandedPorts((prev) => {
      const next = new Set(prev);
      if (next.has(portKey)) {
        next.delete(portKey);
      } else {
        next.add(portKey);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 gap-3">
      <div className="flex flex-wrap items-center justify-between">
        <h3 className="font-medium">Open Ports</h3>
        <div className="text-sm">
          {openPortCount === 1 ? "1 port" : `${openPortCount} ports`}
        </div>
      </div>

      {isLoading && !deviceDetail ? (
        <div className="flex h-24 items-center justify-center gap-2 text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading open ports…
        </div>
      ) : openPorts.length > 0 ? (
        <OpenPortsTable
          ports={openPorts}
          expandedPorts={expandedPorts}
          onToggle={togglePortExpanded}
          deviceDetail={deviceDetail}
        />
      ) : (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          No open ports detected for this device.
        </div>
      )}
    </div>
  );
}
