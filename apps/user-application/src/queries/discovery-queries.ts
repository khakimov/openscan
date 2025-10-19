import { queryOptions } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getScanWorkflowStatusDB,
  getScanWorkflowResultsDB,
} from '@/server/discovery';

export const discoveryQueries = {
  // Workflow status (polls database for postback updates)
  workflowStatus: (scanId: string) =>
    queryOptions({
      queryKey: ['discovery-workflow-status', scanId],
      queryFn: () => getScanWorkflowStatusDB({ data: { scanId } }),
      enabled: !!scanId,
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
  workflowResults: (scanId: string, enabled = false) =>
    queryOptions({
      queryKey: ['discovery-workflow-results', scanId],
      queryFn: () => getScanWorkflowResultsDB({ data: { scanId } }),
      enabled, // Only fetch when workflow is completed
      staleTime: Infinity, // Results don't change once fetched
    }),
};
