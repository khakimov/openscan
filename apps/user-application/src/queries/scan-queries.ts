import { useQuery } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';

/**
 * Centralized scan query key factory (tRPC pattern)
 */
export const scanQueries = {
  /**
   * Scan list query keys (tRPC-compatible)
   */
  list: {
    // Base key for all scan list queries (for invalidation)
    base: ['scan', 'list'] as const,

    // Specific key for a query with params
    key: (params?: {
      projectId?: string;
    }) => [
      ['scan', 'list'],
      { input: params ?? {}, type: 'query' as const }
    ] as const,
  },
};

/**
 * Scan query hooks (reusable across components)
 */

/**
 * Hook to fetch scan list with optional project filter
 * Includes auto-polling for active scans
 */
export const useScanList = (params?: { projectId?: string }) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.scan.list.queryOptions(params ?? {}),
    queryFn: () => trpcClient.scan.list.query(params ?? {}),
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 30s if there are active scans (PENDING or RUNNING)
      if (!Array.isArray(data)) return false;

      const hasActiveScans = data.some(
        (scan: any) => scan.workflowStatus === 'PENDING' || scan.workflowStatus === 'RUNNING'
      );

      return hasActiveScans ? 30000 : false; // 30 seconds
    },
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev, // Prevent flashing during refetch
  });
};
