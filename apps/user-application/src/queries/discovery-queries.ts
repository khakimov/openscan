import { queryOptions } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
  startDiscoveryWorkflow,
} from '@/server/discovery';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

export const discoveryQueries = {
  // Workflow status (polls database for postback updates)
  // Following OpenPanel pattern: accept options to override enabled/staleTime/etc
  workflowStatus: (scanId: string, options?: { enabled?: boolean }) =>
    queryOptions({
      queryKey: ['discovery-workflow-status', scanId],
      queryFn: () => getScanWorkflowStatusDB({ data: { scanId } }),
      enabled: options?.enabled ?? !!scanId,
      refetchInterval: (query) => {
        const data = query.state.data;
        // Stop polling when workflow is complete or failed
        if (data?.isCompleted || data?.isFailed) {
          return false;
        }
        // Poll every 3 seconds (database polling is fast and efficient)
        return QUERY_CONFIG.REFETCH_INTERVAL.SECONDS_3;
      },
      staleTime: 0, // Always fetch fresh status during active discovery
    }),

  // Workflow results (fetched once when workflow completes)
  // Following OpenPanel pattern: accept options to override enabled/staleTime/etc
  workflowResults: (scanId: string, options?: { enabled?: boolean }) =>
    queryOptions({
      queryKey: ['discovery-workflow-results', scanId],
      queryFn: () => getScanWorkflowResultsDB({ data: { scanId } }),
      enabled: options?.enabled ?? false, // Only fetch when workflow is completed
      staleTime: Infinity, // Results don't change once fetched
    }),
};

/**
 * Discovery mutation hooks (following TanStack Router best practice)
 *
 * Benefits:
 * - Centralized invalidation logic
 * - Reusable across components
 * - Type-safe
 * - Follows official TanStack pattern from kitchen-sink-react-query example
 *
 * Usage in components:
 * const startDiscoveryMutation = useStartDiscoveryMutation();
 * startDiscoveryMutation.mutate({ target: 'example.com' });
 */

export const useStartDiscoveryMutation = () =>
  useMutationWithToast({
    mutationKey: ['discovery', 'start'],
    mutationFn: async (data: { target: string }) => {
      const response = await startDiscoveryWorkflow({ data });
      if (!response.success) {
        throw new Error(response.error || 'Failed to start discovery');
      }
      return response;
    },
    successMessage: (response) =>
      `Discovery started for ${response.target}`,
    // Invalidate all scan queries (both list and table, all projectIds)
    invalidateKeys: [['scans'], ['scans-table']],
  });
