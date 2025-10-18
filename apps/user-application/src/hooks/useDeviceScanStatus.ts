import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
// Import directly from source modules to avoid circular dependencies
import { getPortScanState } from '@/server/discovery/workflows/port-scan/lifecycle';
import { startPortScanWorkflow } from '@/server/discovery/workflows/port-scan/start';
import { getActiveDeviceScans } from '@/server/discovery/workflows/device-scan-handler';
import type { PortScanInput } from '@repo/contracts';

/**
 * Custom hook for monitoring device scan status
 * Follows TanStack best practices for polling and state management
 */
export function useDeviceScanStatus(
  deviceId: string,
  scanId: string | null, // Restate workflow key (e.g., "portscan-0-0-0-0-123456")
  enabled = true
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['device-scan-status', deviceId, scanId],
    queryFn: async () => {
      if (!scanId) return null;

      console.log('[useDeviceScanStatus] Fetching scan state', { deviceId, scanId });

      const result = await getPortScanState({ data: { scanId } });

      console.log('[useDeviceScanStatus] getPortScanState result:', {
        success: result.success,
        state: result.state,
        error: result.error,
        errorType: result.errorType,
      });

      if (!result.success) {
        // Attach error metadata for polling decision
        const error: any = new Error(result.error || 'Failed to get scan status');
        error.errorType = result.errorType;
        error.shouldStopPolling = result.shouldStopPolling;
        throw error;
      }

      return result.state;
    },
    enabled: enabled && !!scanId,
    retry: (failureCount, error: any) => {
      // Don't retry terminal workflow errors
      if (error?.shouldStopPolling) {
        return false;
      }
      // Retry transient errors up to 3 times
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const state = query.state.data;
      const error = query.state.error as any;

      // Stop polling on terminal workflow errors
      if (error?.shouldStopPolling) {
        return false;
      }

      // Normalize status for comparison (Restate returns uppercase)
      const normalizedStatus = state?.status?.toLowerCase();

      // Stop polling when scan is complete or failed
      if (normalizedStatus === 'completed' ||
          normalizedStatus === 'failed' ||
          normalizedStatus === 'canceled' ||
          normalizedStatus === 'cancelled') {

        // Invalidate device queries when scan completes
        if (normalizedStatus === 'completed') {
          queryClient.invalidateQueries({ queryKey: ['devices'] });
          queryClient.invalidateQueries({ queryKey: ['scans'] });
        }

        return false;
      }

      // Poll every 30 seconds (postback notifies server immediately, this is just UI sync)
      return QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_30;
    },
    refetchIntervalInBackground: false,
    staleTime: QUERY_CONFIG.STALE_TIME.SECONDS_30,
  });

  // Extract error type for better UI handling
  const errorObj = error as any;
  const errorType = errorObj?.errorType;
  const shouldStopPolling = errorObj?.shouldStopPolling;

  // Normalize status for comparison (Restate returns uppercase)
  const normalizedStatus = data?.status?.toLowerCase();

  return {
    scanState: data,
    isLoading,
    isFetching,
    error: error?.message || null,
    errorType,
    shouldStopPolling,
    isScanning: normalizedStatus === 'scanning' || normalizedStatus === 'prescanning' || normalizedStatus === 'parsing' || normalizedStatus === 'validating',
    isCompleted: normalizedStatus === 'completed',
    isFailed: normalizedStatus === 'failed' || shouldStopPolling,
    isCanceled: normalizedStatus === 'canceled' || normalizedStatus === 'cancelled',
    progress: (data as any)?.progress || 0,
    progressMessage: (data as any)?.progressMessage,
  };
}

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
 */
export function useActiveDeviceScans(deviceId: string) {
  return useQuery({
    queryKey: ['active-device-scans', deviceId],
    queryFn: async () => {
      const result = await getActiveDeviceScans({ data: { deviceId } });
      if (!result.success) {
        throw new Error(result.error || 'Failed to get active scans');
      }
      return result.activeScans;
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
 */
export function useDeviceScan(deviceId: string) {
  const queryClient = useQueryClient();

  // Check for active scans in database on load
  const { data: databaseActiveScans = [] } = useActiveDeviceScans(deviceId);

  // Get any active scanId from query cache or database
  let activeScanId = queryClient.getQueryData<string>(['active-scan', deviceId]) || null;

  // If no cached scanId but database shows active scans, use the first one
  if (!activeScanId && databaseActiveScans.length > 0) {
    activeScanId = databaseActiveScans[0];
    console.log('[useDeviceScan] Using scanId from database', { activeScanId });
    // Cache it for future use
    queryClient.setQueryData(['active-scan', deviceId], activeScanId);
  }

  // Monitor scan status
  const scanStatus = useDeviceScanStatus(deviceId, activeScanId);

  // Start scan mutation
  const startScan = useStartScanMutation(deviceId);

  // Set active scanId when scan starts
  const handleStartScan = async (payload: PortScanInput) => {
    const result = await startScan.mutateAsync(payload);

    if (result.success && result.scanId) {
      // Store the scanId in query cache
      queryClient.setQueryData(['active-scan', deviceId], result.scanId);
      // Refresh the database active scans list
      queryClient.invalidateQueries({ queryKey: ['active-device-scans', deviceId] });
    }

    return result;
  };

  // Clear scanId when scan completes and refresh device data
  // Note: We check after the hook runs to avoid modifying state during render
  if ((scanStatus.isCompleted || scanStatus.isFailed || scanStatus.isCanceled) && activeScanId) {
    console.log('[useDeviceScan] Scan completed/failed/canceled, clearing scanId and invalidating queries', {
      deviceId,
      activeScanId,
      isCompleted: scanStatus.isCompleted,
      isFailed: scanStatus.isFailed,
      isCanceled: scanStatus.isCanceled,
    });

    // Use effect-like cleanup - schedule for next tick
    Promise.resolve().then(() => {
      console.log('[useDeviceScan] Executing cleanup - invalidating queries', { deviceId });
      queryClient.setQueryData(['active-scan', deviceId], null);
      // Refresh all related queries after scan completion
      queryClient.invalidateQueries({ queryKey: ['active-device-scans', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] }); // Refresh device list
      queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] }); // Refresh device detail
      queryClient.invalidateQueries({ queryKey: ['scans'] }); // Refresh scans list
      console.log('[useDeviceScan] Queries invalidated successfully');
    });
  }

  return {
    ...scanStatus,
    startScan: handleStartScan,
    isStartingScan: startScan.isPending,
    activeScanId,
  };
}
