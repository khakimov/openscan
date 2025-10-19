import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getDeviceDetailData,
  getDevicesData,
  getDeviceScanHistoryData,
  getDeviceVulnerabilitiesData,
  deleteDevice,
  updateDeviceData,
  verifyDevice,
  toggleDeviceVerification,
  createDevicesFromDiscovery,
  startDeviceScan,
} from '@/server/devices';
import { getActiveDeviceScans } from '@/server/discovery/workflows/device-scan-handler';
import { createOptimisticDeleteHandlers } from '@/lib/optimistic-updates';

/**
 * Centralized device query definitions using queryOptions()
 *
 * Benefits:
 * - Reusable in loaders (ensureQueryData) and components (useSuspenseQuery)
 * - Type-safe query keys
 * - Single source of truth for query configuration
 * - Easy invalidation in mutations
 *
 * Usage:
 * - In loader: queryClient.ensureQueryData(deviceQueries.list({ verificationStatus }))
 * - In component: useSuspenseQuery(deviceQueries.list({ verificationStatus }))
 * - In mutation: queryClient.invalidateQueries({ queryKey: deviceQueries.list().queryKey })
 */
export const deviceQueries = {
  /**
   * Device list query (with optional filtering)
   */
  list: (params?: {
    verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[];
  }) =>
    queryOptions({
      queryKey: ['devices', params?.verificationStatus],
      queryFn: () => getDevicesData({ data: { verificationStatus: params?.verificationStatus } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Single device detail query
   */
  detail: (deviceId: string) =>
    queryOptions({
      queryKey: ['device-detail', deviceId],
      queryFn: () => getDeviceDetailData({ data: { deviceId } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Device scan history query
   */
  scanHistory: (target: string, limit = 10) =>
    queryOptions({
      queryKey: ['device-scan-history', target, limit],
      queryFn: () => getDeviceScanHistoryData({ data: { target, limit } }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Device vulnerabilities query (paginated)
   */
  vulnerabilities: (deviceId: string, page = 1, sortByCvss = true) =>
    queryOptions({
      queryKey: ['device-vulnerabilities', deviceId, page, sortByCvss],
      queryFn: () =>
        getDeviceVulnerabilitiesData({
          data: {
            deviceId,
            page,
            sortColumn: sortByCvss ? 'cvssScore' : undefined,
            sortDirection: sortByCvss ? 'descending' : undefined,
          },
        }),
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * All vulnerabilities for a device (non-paginated)
   * Fetches all pages and combines them
   */
  vulnerabilitiesAll: (deviceId: string, sortByCvss = true) =>
    queryOptions({
      queryKey: ['device-vulnerabilities-all', deviceId, sortByCvss],
      queryFn: async () => {
        // First, get page 1 to know total pages
        const firstPage = await getDeviceVulnerabilitiesData({
          data: {
            deviceId,
            page: 1,
            sortColumn: sortByCvss ? 'cvssScore' : undefined,
            sortDirection: sortByCvss ? 'descending' : undefined,
          },
        });

        if (!firstPage.totalPages || firstPage.totalPages <= 1) {
          return firstPage;
        }

        // Fetch all remaining pages in parallel
        const remainingPages = Array.from(
          { length: firstPage.totalPages - 1 },
          (_, i) => i + 2,
        );

        const allPages = await Promise.all([
          Promise.resolve(firstPage),
          ...remainingPages.map((page) =>
            getDeviceVulnerabilitiesData({
              data: {
                deviceId,
                page,
                sortColumn: sortByCvss ? 'cvssScore' : undefined,
                sortDirection: sortByCvss ? 'descending' : undefined,
              },
            }),
          ),
        ]);

        // Combine all items
        const allItems = allPages.flatMap((page) => page.items || []);

        return {
          ...firstPage,
          items: allItems,
          page: 1,
          totalPages: 1,
        };
      },
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Active scans for a device (polling query)
   * Automatically stops polling when no active scans
   */
  activeScans: (deviceId: string) =>
    queryOptions({
      queryKey: ['active-device-scans', deviceId],
      queryFn: async () => {
        const result = await getActiveDeviceScans({ data: { deviceId } });
        if (!result.success) {
          throw new Error(result.error || 'Failed to get active scans');
        }
        return result.activeScans || [];
      },
      staleTime: QUERY_CONFIG.STALE_TIME.SECONDS_30,
      refetchInterval: (query) => {
        const activeScans = query.state.data;
        // Stop polling when no active scans
        return activeScans?.length ? QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_30 : false;
      },
      refetchIntervalInBackground: false,
    }),
};

/**
 * Device mutation hooks (following TanStack Router best practice)
 *
 * Benefits:
 * - Centralized invalidation logic
 * - Reusable across components
 * - Type-safe
 * - Follows official TanStack pattern from kitchen-sink-react-query example
 *
 * Usage in components:
 * const deleteMutation = useDeleteDeviceMutation();
 * deleteMutation.mutate({ deviceId: '123' });
 */

export const useDeleteDeviceMutation = () => {
  const queryClient = useQueryClient();

  // Optimistic delete: Update UI immediately, rollback on error
  const optimistic = createOptimisticDeleteHandlers([
    ['devices'], // Update all device list queries
  ]);

  return useMutation({
    mutationKey: ['devices', 'delete'],
    mutationFn: (data: { deviceId: string }) => deleteDevice({ data }),
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};

export const useUpdateDeviceMutation = (deviceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'update', deviceId],
    mutationFn: (data: {
      deviceId: string;
      updates: {
        name?: string;
        ip?: string;
        state?: string;
        scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
        source?: string;
        isScanned?: boolean;
        respondsToPing?: boolean;
        tags?: string[];
        notes?: string;
      };
    }) => updateDeviceData({ data }),
    onSuccess: () => {
      // Invalidate all device queries
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: deviceQueries.detail(deviceId).queryKey });
      queryClient.invalidateQueries({ queryKey: ['deviceTagSuggestions'] });
    },
  });
};

export const useVerifyDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'verify'],
    mutationFn: (data: {
      deviceId: string;
      status: 'VERIFIED' | 'EXCLUDED' | 'CANDIDATE';
      note?: string;
    }) => verifyDevice({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};

export const useToggleDeviceVerificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'toggle-verification'],
    mutationFn: (data: {
      deviceId: string;
      verify: boolean;
      interval?: string;
    }) => toggleDeviceVerification({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};

export const useStartDeviceScanMutation = (deviceId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['devices', 'scan', deviceId],
    mutationFn: (data: { deviceId: string; target: string; preset: string }) =>
      startDeviceScan({ data }),
    onSuccess: () => {
      // Invalidate active scans to trigger re-poll
      queryClient.invalidateQueries({ queryKey: deviceQueries.activeScans(deviceId).queryKey });
    },
  });
};

export const useCreateDevicesFromDiscoveryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['devices', 'create-from-discovery'],
    mutationFn: (data: {
      targets: Array<{ host: string; ip?: string }>;
      organizationId?: string;
      projectId?: string;
      options?: {
        source?: string;
        scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
        verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
      };
    }) => createDevicesFromDiscovery({ data }),
    onSuccess: () => {
      // Invalidate all device list queries after server confirms creation
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
};
