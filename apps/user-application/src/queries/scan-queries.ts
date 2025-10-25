import { queryOptions } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import { getScans } from '@/server/scans';

/**
 * Centralized scan query definitions using queryOptions()
 *
 * Usage:
 * - In loader: queryClient.ensureQueryData(scanQueries.list({ projectId }))
 * - In component: useSuspenseQuery(scanQueries.list({ projectId }))
 * - In mutation: queryClient.invalidateQueries({ queryKey: scanQueries.list().queryKey })
 */
export const scanQueries = {
  /**
   * Scans list query
   * Used for general scan fetching without polling
   */
  list: (params?: { projectId?: string }) =>
    queryOptions({
      queryKey: ['scans', params?.projectId],
      queryFn: () => getScans({ data: { projectId: params?.projectId } }),
      refetchOnWindowFocus: false,
      ...QUERY_CONFIG.DEFAULTS.DYNAMIC_DATA,
    }),

  /**
   * Scans table query with auto-polling
   * Polls every 30s when active scans (PENDING/RUNNING) exist
   */
  table: (params?: { projectId?: string }) =>
    queryOptions({
      queryKey: ['scans-table', params?.projectId],
      queryFn: () => getScans({ data: { projectId: params?.projectId } }),
      refetchInterval: (query) => {
        const data = query.state.data;
        // Only poll if there are active scans (PENDING or RUNNING)
        if (!data?.success || !Array.isArray(data.data)) {
          return false;
        }

        const hasActiveScans = data.data.some(
          (scan: any) => scan.status === 'PENDING' || scan.status === 'RUNNING'
        );

        // Poll every 30 seconds (postback updates database, this is just UI sync)
        return hasActiveScans ? QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_30 : false;
      },
      refetchIntervalInBackground: false, // Only poll when tab is active
      placeholderData: (previousData) => previousData, // Prevent jank during refetch
      ...QUERY_CONFIG.DEFAULTS.DYNAMIC_DATA,
    }),
};
