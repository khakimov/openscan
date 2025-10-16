import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import { getPortScanState, startPortScanWorkflow, getActiveDeviceScans } from '@/server/discovery';
import type { PortScanInput } from '@repo/contracts';

/**
 * Custom hook for monitoring device scan status
 * Follows TanStack best practices for polling and state management
 */
export function useDeviceScanStatus(
  deviceId: string,
  workflowId: string | null,
  enabled = true
) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['device-scan-status', deviceId, workflowId],
    queryFn: async () => {
      if (!workflowId) return null;

      const result = await getPortScanState({ data: { workflowId } });

      if (!result.success) {
        // Attach error metadata for polling decision
        const error: any = new Error(result.error || 'Failed to get scan status');
        error.errorType = result.errorType;
        error.shouldStopPolling = result.shouldStopPolling;
        throw error;
      }

      return result.state;
    },
    enabled: enabled && !!workflowId,
    retry: (failureCount, error: any) => {
      // Don't retry terminal Temporal errors
      if (error?.shouldStopPolling) {
        return false;
      }
      // Retry transient errors up to 3 times
      return failureCount < 3;
    },
    refetchInterval: (query) => {
      const state = query.state.data;
      const error = query.state.error as any;

      // Stop polling on terminal Temporal errors
      if (error?.shouldStopPolling) {
        return false;
      }

      // Stop polling when scan is complete or failed
      if (state?.status === 'completed' ||
          state?.status === 'failed' ||
          state?.status === 'canceled') {

        // Invalidate device queries when scan completes
        if (state?.status === 'completed') {
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

  return {
    scanState: data,
    isLoading,
    isFetching,
    error: error?.message || null,
    errorType,
    shouldStopPolling,
    isScanning: data?.status === 'scanning',
    isCompleted: data?.status === 'completed',
    isFailed: data?.status === 'failed' || shouldStopPolling,
    isCanceled: data?.status === 'canceled',
    progress: data?.progress || 0,
    progressMessage: data?.progressMessage,
  };
}

/**
 * Custom hook for starting scan with optimistic updates
 */
export function useStartScanMutation(deviceId: string) {
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

    onError: (err, variables, context) => {
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

  // Get any active workflow ID from query cache or database
  let activeWorkflowId = queryClient.getQueryData<string>(['active-scan', deviceId]) || null;

  // If no cached workflow ID but database shows active scans, use the first one
  if (!activeWorkflowId && databaseActiveScans.length > 0) {
    activeWorkflowId = databaseActiveScans[0];
    // Cache it for future use
    queryClient.setQueryData(['active-scan', deviceId], activeWorkflowId);
  }

  // Monitor scan status
  const scanStatus = useDeviceScanStatus(deviceId, activeWorkflowId);

  // Start scan mutation
  const startScan = useStartScanMutation(deviceId);

  // Set active workflow ID when scan starts
  const handleStartScan = async (payload: PortScanInput) => {
    const result = await startScan.mutateAsync(payload);

    if (result.success && result.workflowId) {
      // Store the workflow ID in query cache
      queryClient.setQueryData(['active-scan', deviceId], result.workflowId);
      // Refresh the database active scans list
      queryClient.invalidateQueries({ queryKey: ['active-device-scans', deviceId] });
    }

    return result;
  };

  // Clear workflow ID when scan completes and refresh device data
  if (scanStatus.isCompleted || scanStatus.isFailed || scanStatus.isCanceled) {
    if (activeWorkflowId) {
      queryClient.setQueryData(['active-scan', deviceId], null);
      // Refresh all related queries after scan completion
      queryClient.invalidateQueries({ queryKey: ['active-device-scans', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] }); // Refresh device list
      queryClient.invalidateQueries({ queryKey: ['device-detail', deviceId] }); // Refresh device detail
      queryClient.invalidateQueries({ queryKey: ['scans'] }); // Refresh scans list
    }
  }

  return {
    ...scanStatus,
    startScan: handleStartScan,
    isStartingScan: startScan.isPending,
    activeWorkflowId,
  };
}