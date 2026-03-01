import { useQuery } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';
import { QUERY_CONFIG } from '@repo/constants';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

/**
 * Discovery query key factory (tRPC pattern)
 */
export const discoveryQueries = {
  workflowStatus: {
    base: ['discovery', 'workflowStatus'] as const,
  },
  workflowResults: {
    base: ['discovery', 'workflowResults'] as const,
  },
};

/**
 * Hook: Poll discovery workflow status via tRPC
 *
 * Follows the same tRPC query pattern as scan-queries.ts.
 * Automatically stops polling when workflow completes or fails.
 */
export function useDiscoveryWorkflowStatus(scanId: string, options?: { enabled?: boolean }) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.discovery.workflowStatus.queryOptions({ scanId }),
    enabled: options?.enabled ?? !!scanId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.isCompleted || data?.isFailed) {
        return false;
      }
      return QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_3;
    },
    staleTime: 0,
  });
}

/**
 * Hook: Fetch discovery workflow results via tRPC
 *
 * Only fetches when explicitly enabled (workflow completed).
 * Results are cached indefinitely since they don't change.
 */
export function useDiscoveryWorkflowResults(scanId: string, options?: { enabled?: boolean }) {
  const trpc = useTRPC();

  return useQuery({
    ...trpc.discovery.workflowResults.queryOptions({ scanId }),
    enabled: options?.enabled ?? false,
    staleTime: Infinity,
  });
}

/**
 * Start discovery mutation (following device-queries pattern)
 *
 * Usage:
 *   const startDiscovery = useStartDiscoveryMutation();
 *   startDiscovery.mutate({ target: 'example.com' });
 */
export const useStartDiscoveryMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['discovery', 'start'],
    mutationFn: async (data: { target: string }) => {
      const response = await trpcClient.discovery.start.mutate(data);
      if (!response.success) {
        throw new Error(response.error || 'Failed to start discovery');
      }
      return response;
    },
    successMessage: (response) =>
      `Discovery started for ${response.target}`,
    invalidateKeys: [['scans'], ['scans-table']],
  });
};
