import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import { startPortScanWorkflow } from '@/server/discovery/workflows/port-scan/start';
import { getActiveDeviceScans } from '@/server/discovery/workflows/device-scan-handler';
import type { PortScanInput } from '@repo/contracts';

/**
 * ARCHITECTURE NOTE:
 * This hook relies on database polling only (no Restate polling).
 * The postback system (worker → HTTP POST → server) updates the database
 * when scans complete. This is our "push notification" mechanism.
 *
 * Flow:
 * 1. UI calls startScan → creates workflow in Restate + database
 * 2. useActiveDeviceScans polls database for RUNNING workflows
 * 3. Worker completes scan → sends postback → updates database to SUCCEEDED
 * 4. Database query returns empty array → UI shows scan complete
 */

/**
 * Custom hook for starting scan with optimistic updates
 */
export function useStartScanMutation(_deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PortScanInput) =>
      startPortScanWorkflow({ data: payload }),

    onMutate: async () => {
      // Cancel any ongoing queries for this device
      await queryClient.cancelQueries({ queryKey: ['devices'] });

      // Optimistically update the device to show it's scanning
      const previousDevices = queryClient.getQueryData(['devices']);

      // Update device list to show scanning state
      queryClient.setQueryData(['devices'], (old: any) => {
        if (!old) return old;
        // Update the specific device to show scanning state
        // This would need to match your actual data structure
        return old;
      });

      return { previousDevices };
    },

    onError: (_err, _variables, context) => {
      // Revert on error
      if (context?.previousDevices) {
        queryClient.setQueryData(['devices'], context.previousDevices);
      }
    },

    onSuccess: (data) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['scans'] });

      return data;
    },
  });
}

/**
 * Hook to check for active scans in database
 * Stops polling automatically when no active scans are found
 * Invalidates device queries when scan completes
 */
export function useActiveDeviceScans(deviceId: string) {
  const queryClient = useQueryClient();
  const previousActiveScansRef = React.useRef<string[]>([]);

  return useQuery({
    queryKey: ['active-device-scans', deviceId],
    queryFn: async () => {
      const result = await getActiveDeviceScans({ data: { deviceId } });
      if (!result.success) {
        throw new Error(result.error || 'Failed to get active scans');
      }

      const activeScans = result.activeScans || [];
      const previousActiveScans = previousActiveScansRef.current;

      // Detect scan completion: had active scans before, now has none
      if (previousActiveScans.length > 0 && activeScans.length === 0) {
        console.log('🔄 Scan completed - invalidating device queries', { deviceId });

        // Invalidate device queries to refetch with updated port data
        queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] });
        queryClient.invalidateQueries({ queryKey: ['devices'] });
      }

      // Update ref for next poll
      previousActiveScansRef.current = activeScans;

      return activeScans;
    },
    staleTime: QUERY_CONFIG.STALE_TIME.SECONDS_30,
    refetchInterval: (query) => {
      const activeScans = query.state.data;

      // Only poll if there are active scans
      if (!activeScans || activeScans.length === 0) {
        return false; // Stop polling when no active scans
      }

      // Poll every 30 seconds to catch status changes
      return QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_30;
    },
    refetchIntervalInBackground: false, // Don't poll when tab is not active
  });
}

/**
 * Combined hook for device scan management
 * Derives scanning state from database queries only - single source of truth
 */
export function useDeviceScan(deviceId: string) {
  const queryClient = useQueryClient();

  // Check for active scans in database (polls every 30s while scans are active)
  const { data: databaseActiveScans = [], isLoading, error } = useActiveDeviceScans(deviceId);

  // Derive activeScanId from database (single source of truth)
  const activeScanId = databaseActiveScans[0] || null;

  // Start scan mutation
  const startScan = useStartScanMutation(deviceId);

  // Set active scanId when scan starts
  const handleStartScan = async (payload: PortScanInput) => {
    const result = await startScan.mutateAsync(payload);

    if (result.success && result.scanId) {
      // Refresh the database active scans list to pick up new scan
      queryClient.invalidateQueries({ queryKey: ['active-device-scans', deviceId] });
    }

    return result;
  };

  return {
    // Scan state (derived from database)
    activeScanId,
    isScanning: !!activeScanId, // If scanId exists, scan is running
    isLoading,
    error: error?.message || null,

    // Actions
    startScan: handleStartScan,
    isStartingScan: startScan.isPending,

    // Backward compatibility (removed fields)
    isCompleted: false, // No longer tracked (postback handles completion)
    isFailed: false, // No longer tracked
    isCanceled: false, // No longer tracked
    progress: 0, // No longer available (no Restate polling)
    progressMessage: undefined, // No longer available
  };
}
