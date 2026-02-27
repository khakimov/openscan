/**
 * Device List Context
 *
 * Architecture:
 * - Parent route fetches device list WITH active scans in ONE query
 * - Context provides devices + active scans to all children
 * - Polling happens at parent level (single query refresh)
 * - Child components receive data via context (no N+1 queries)
 *
 * Benefits:
 * - 1 query for devices + active scans instead of N+1
 * - Centralized polling logic
 * - Consistent data across all device cards
 * - Lazy loading for device detail (Sheet only)
 */

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/integrations/trpc/react";
import type { TransformedDevice } from "@repo/contracts/device";

// Active scans are just workflow IDs (strings) returned from the batch query
// This is a lightweight format to minimize data transfer
interface DeviceWithActiveScans extends TransformedDevice {
  activeScans: string[]; // Array of Restate workflow IDs
}

export interface DeviceCounts {
  CANDIDATE: number;
  VERIFIED: number;
  EXCLUDED: number;
  total: number;
}

interface DeviceListContextValue {
  devices: DeviceWithActiveScans[];
  counts: DeviceCounts | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  /** Manually refresh device list (e.g., after mutations) */
  refresh: () => Promise<void>;
  /** Get active scans for a specific device (from cached data) */
  getDeviceActiveScans: (deviceId: string) => string[];
  /** Check if any device has active scans (for global polling decision) */
  hasAnyActiveScans: boolean;
}

const DeviceListContext = createContext<DeviceListContextValue | null>(null);

interface DeviceListProviderProps {
  children: ReactNode;
  projectId: string;
  verificationStatus: ("CANDIDATE" | "VERIFIED" | "EXCLUDED")[];
  /** Polling interval when there are active scans (ms) */
  pollingInterval?: number;
}

export function DeviceListProvider({
  children,
  projectId,
  verificationStatus,
  pollingInterval = 5000,
}: DeviceListProviderProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Single query fetches devices + active scans for ALL devices
  // No N+1 - server fetches active scans in parallel and returns everything
  const {
    data: devicesResponse,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    ...trpc.device.listWithDetails.queryOptions({
      projectId,
      verificationStatus,
      includeHistory: false,
    }),
    // Poll every 5 seconds while ANY device has active scans
    // This replaces the N individual polling queries in DeviceCard
    refetchInterval: (query) => {
      const devices = query.state.data?.items ?? [];
      const hasActiveScans = devices.some(
        (d: DeviceWithActiveScans) => d.activeScans.length > 0
      );
      return hasActiveScans ? pollingInterval : false;
    },
    // Keep previous data to avoid flickering during refresh
    placeholderData: (previousData) => previousData,
  });

  const devices = devicesResponse?.items ?? [];

  // Build lookup map for O(1) access by child components
  const activeScansByDevice = useMemo(() => {
    const map = new Map<string, string[]>();
    devices.forEach((device: DeviceWithActiveScans) => {
      map.set(device.id, device.activeScans ?? []);
    });
    return map;
  }, [devices]);

  const getDeviceActiveScans = useCallback(
    (deviceId: string): string[] => {
      return activeScansByDevice.get(deviceId) ?? [];
    },
    [activeScansByDevice]
  );

  const hasAnyActiveScans = devices.some(
    (d: DeviceWithActiveScans) => d.activeScans.length > 0
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.device.listWithDetails.queryKey({
        projectId,
        verificationStatus,
        includeHistory: false,
      }),
    });
  }, [queryClient, trpc.device.listWithDetails, projectId, verificationStatus]);

  const counts = devicesResponse?.counts;

  const value: DeviceListContextValue = {
    devices,
    counts,
    isLoading,
    isFetching,
    error,
    refresh,
    getDeviceActiveScans,
    hasAnyActiveScans,
  };

  return (
    <DeviceListContext.Provider value={value}>
      {children}
    </DeviceListContext.Provider>
  );
}

export function useDeviceList() {
  const context = useContext(DeviceListContext);
  if (!context) {
    throw new Error("useDeviceList must be used within DeviceListProvider");
  }
  return context;
}

export function useDeviceActiveScans(deviceId: string) {
  const { getDeviceActiveScans, hasAnyActiveScans } = useDeviceList();
  const activeScans = getDeviceActiveScans(deviceId);
  return {
    activeScans,
    hasActiveScans: activeScans.length > 0,
    hasAnyActiveScans,
  };
}
