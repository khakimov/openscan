import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

/**
 * Schedule query key factory (tRPC pattern)
 */
export const scheduleQueries = {
  list: {
    base: ['schedule', 'list'] as const,
    key: (params?: {
      isActive?: boolean;
      status?: 'ACTIVE' | 'PAUSED' | 'AUTO_PAUSED' | 'DELETED';
    }) => [
      ['schedule', 'list'],
      { input: params ?? {}, type: 'query' as const }
    ] as const,
  },
  listByDevice: {
    key: (deviceId: string) => [
      ['schedule', 'listByDevice'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
  detail: {
    key: (scheduleId: string) => [
      ['schedule', 'detail'],
      { input: { scheduleId }, type: 'query' as const }
    ] as const,
  },
};

/**
 * Schedule query hooks
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

export const useScheduleListByDevice = (deviceId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.schedule.listByDevice.queryOptions({ deviceId }),
    queryFn: () => trpcClient.schedule.listByDevice.query({ deviceId }),
  });
};

export const useScheduleDetail = (scheduleId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.schedule.detail.queryOptions({ scheduleId }),
    queryFn: () => trpcClient.schedule.detail.query({ scheduleId }),
  });
};

/**
 * Schedule mutation hooks
 *
 * Pattern reference (see docs/optimistic-ui.md):
 * - Pattern 1 (Simple Invalidation): For create and delete
 * - Pattern 2 (Inline Optimistic): For pause/resume (status changes visible in UI)
 */

/**
 * Create schedule - Pattern 1: Simple Invalidation
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
      await queryClient.invalidateQueries({
        queryKey: scheduleQueries.listByDevice.key(variables.deviceId),
      });
    },
  });
};

/**
 * Pause schedule - Pattern 2: Inline Optimistic Update
 */
export const usePauseScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'pause'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.pause.mutate(data),
    successMessage: 'Schedule paused successfully',
    invalidateKeys: [scheduleQueries.list.base],

    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: scheduleQueries.list.base }),
        queryClient.cancelQueries({ queryKey: scheduleQueries.detail.key(variables.scheduleId) }),
      ]);

      const listSnapshot = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });
      const detailSnapshot = queryClient.getQueryData(scheduleQueries.detail.key(variables.scheduleId));

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'PAUSED', isActive: false }
            : item
        );
      });

      queryClient.setQueryData(
        scheduleQueries.detail.key(variables.scheduleId),
        (old: any) => (old ? { ...old, status: 'PAUSED', isActive: false } : old)
      );

      return { listSnapshot, detailSnapshot };
    },

    onError: (_err, variables, context) => {
      context?.listSnapshot?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.detailSnapshot) {
        queryClient.setQueryData(
          scheduleQueries.detail.key(variables.scheduleId),
          context.detailSnapshot
        );
      }
    },
  });
};

/**
 * Resume schedule - Pattern 2: Inline Optimistic Update
 */
export const useResumeScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'resume'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.resume.mutate(data),
    successMessage: 'Schedule resumed successfully',
    invalidateKeys: [scheduleQueries.list.base],

    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: scheduleQueries.list.base }),
        queryClient.cancelQueries({ queryKey: scheduleQueries.detail.key(variables.scheduleId) }),
      ]);

      const listSnapshot = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });
      const detailSnapshot = queryClient.getQueryData(scheduleQueries.detail.key(variables.scheduleId));

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 }
            : item
        );
      });

      queryClient.setQueryData(
        scheduleQueries.detail.key(variables.scheduleId),
        (old: any) =>
          old
            ? { ...old, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 }
            : old
      );

      return { listSnapshot, detailSnapshot };
    },

    onError: (_err, variables, context) => {
      context?.listSnapshot?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      if (context?.detailSnapshot) {
        queryClient.setQueryData(
          scheduleQueries.detail.key(variables.scheduleId),
          context.detailSnapshot
        );
      }
    },
  });
};

/**
 * Delete schedule - Pattern 1: Simple Invalidation
 */
export const useDeleteScheduleMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'delete'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.delete.mutate(data),
    successMessage: 'Schedule deleted successfully',
    invalidateKeys: [scheduleQueries.list.base, ['schedule', 'listByDevice']],
  });
};
