import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { createOptimisticScheduleDeleteHandlers } from '@/lib/optimistic-updates';
import { invalidateTRPCQuery } from '@/lib/query-utils';

/**
 * Centralized schedule query key factory (tRPC pattern)
 */
export const scheduleQueries = {
  /**
   * Schedule list query keys (tRPC-compatible)
   */
  list: {
    // Base key for all schedule list queries (for invalidation)
    base: ['schedule', 'list'] as const,

    // Specific key for a query with params
    key: (params?: {
      isActive?: boolean;
      status?: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
    }) => [
      ['schedule', 'list'],
      { input: params ?? {}, type: 'query' as const }
    ] as const,
  },

  /**
   * Schedules for a device query keys
   */
  listByDevice: {
    key: (deviceId: string) => [
      ['schedule', 'listByDevice'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },

  /**
   * Single schedule detail query key
   */
  detail: {
    key: (scheduleId: string) => [
      ['schedule', 'detail'],
      { input: { scheduleId }, type: 'query' as const }
    ] as const,
  },
};

/**
 * Schedule query hooks (reusable across components)
 */

/**
 * Hook to fetch all schedules for organization
 */
export const useScheduleList = (params?: {
  isActive?: boolean;
  status?: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
}) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.schedule.list.queryOptions(params),
    queryFn: () => trpcClient.schedule.list.query(params),
  });
};

/**
 * Hook to fetch schedules for a specific device
 */
export const useScheduleListByDevice = (deviceId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.schedule.listByDevice.queryOptions({ deviceId }),
    queryFn: () => trpcClient.schedule.listByDevice.query({ deviceId }),
  });
};

/**
 * Hook to fetch schedule details
 */
export const useScheduleDetail = (scheduleId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.schedule.detail.queryOptions({ scheduleId }),
    queryFn: () => trpcClient.schedule.detail.query({ scheduleId }),
  });
};

/**
 * Schedule mutation hooks (tRPC pattern)
 */

export const useCreateScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'create'],
    mutationFn: (data: {
      deviceId: string;
      preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
      scheduleFrequency: 'EVERY_30_MINUTES' | 'EVERY_HOUR' | 'EVERY_6_HOURS' | 'EVERY_12_HOURS' | 'DAILY';
      dailyTime?: string;
      startImmediately?: boolean;
    }) => trpcClient.schedule.create.mutate(data),
    successMessage: 'Scan schedule created successfully',
    invalidateKeys: [scheduleQueries.list.base],
    onSuccess: async (_result, variables) => {
      // Also invalidate device-specific schedules
      await queryClient.invalidateQueries({
        queryKey: scheduleQueries.listByDevice.key(variables.deviceId),
      });
    },
  });
};

export const usePauseScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'pause'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.pause.mutate(data),
    successMessage: 'Schedule paused successfully',
    invalidateKeys: [scheduleQueries.list.base],

    // Optimistic update: Change status to PAUSED immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: scheduleQueries.list.base });
      await queryClient.cancelQueries({ queryKey: scheduleQueries.detail.key(variables.scheduleId) });

      // Snapshot previous values
      const schedulesSnapshot = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });
      const detailSnapshot = queryClient.getQueryData(scheduleQueries.detail.key(variables.scheduleId));

      // Optimistically update status to PAUSED
      const updateScheduleStatus = (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((item: any) =>
            item.scheduleId === variables.scheduleId
              ? { ...item, status: 'PAUSED', isActive: false }
              : item
          );
        }
        return old;
      };

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, updateScheduleStatus);
      queryClient.setQueryData(scheduleQueries.detail.key(variables.scheduleId), (old: any) =>
        old ? { ...old, status: 'PAUSED', isActive: false } : old
      );

      return { schedulesSnapshot, detailSnapshot };
    },

    // Rollback on error
    onError: (_err, variables, context) => {
      if (context?.schedulesSnapshot) {
        context.schedulesSnapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.detailSnapshot) {
        queryClient.setQueryData(scheduleQueries.detail.key(variables.scheduleId), context.detailSnapshot);
      }
    },

    // Refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries(invalidateTRPCQuery(scheduleQueries.list.base));
    },
  });
};

export const useResumeScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'resume'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.resume.mutate(data),
    successMessage: 'Schedule resumed successfully',
    invalidateKeys: [scheduleQueries.list.base],

    // Optimistic update: Change status to ACTIVE immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: scheduleQueries.list.base });
      await queryClient.cancelQueries({ queryKey: scheduleQueries.detail.key(variables.scheduleId) });

      // Snapshot previous values
      const schedulesSnapshot = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });
      const detailSnapshot = queryClient.getQueryData(scheduleQueries.detail.key(variables.scheduleId));

      // Optimistically update status to ACTIVE
      const updateScheduleStatus = (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((item: any) =>
            item.scheduleId === variables.scheduleId
              ? { ...item, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 }
              : item
          );
        }
        return old;
      };

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, updateScheduleStatus);
      queryClient.setQueryData(scheduleQueries.detail.key(variables.scheduleId), (old: any) =>
        old ? { ...old, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 } : old
      );

      return { schedulesSnapshot, detailSnapshot };
    },

    // Rollback on error
    onError: (_err, variables, context) => {
      if (context?.schedulesSnapshot) {
        context.schedulesSnapshot.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      if (context?.detailSnapshot) {
        queryClient.setQueryData(scheduleQueries.detail.key(variables.scheduleId), context.detailSnapshot);
      }
    },

    // Refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries(invalidateTRPCQuery(scheduleQueries.list.base));
    },
  });
};

export const useDeleteScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  // Optimistic delete: Update UI immediately, rollback on error
  // Include both list and listByDevice queries for proper cache invalidation
  const optimistic = createOptimisticScheduleDeleteHandlers([
    scheduleQueries.list.base,
    ['schedule', 'listByDevice'], // Also update device-specific schedule lists
  ]);

  return useMutationWithToast({
    mutationKey: ['schedule', 'delete'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.delete.mutate(data),
    successMessage: 'Schedule deleted successfully',
    invalidateKeys: [scheduleQueries.list.base, ['schedule', 'listByDevice']],
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};
