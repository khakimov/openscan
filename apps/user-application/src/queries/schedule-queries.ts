import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@repo/constants';
import {
  getScheduleData,
  getSchedulesForDeviceData,
  getSchedulesData,
  createScheduleData,
  pauseScheduleData,
  resumeScheduleData,
  deleteScheduleData,
  type CreateScheduleInput,
} from '@/server/schedules';
import { createOptimisticScheduleDeleteHandlers } from '@/lib/optimistic-updates';

/**
 * Centralized schedule query definitions using queryOptions()
 *
 * Benefits:
 * - Reusable in loaders (ensureQueryData) and components (useSuspenseQuery)
 * - Type-safe query keys
 * - Single source of truth for query configuration
 * - Easy invalidation in mutations
 *
 * Usage:
 * - In loader: queryClient.ensureQueryData(scheduleQueries.forDevice(deviceId))
 * - In component: useSuspenseQuery(scheduleQueries.forDevice(deviceId))
 * - In mutation: queryClient.invalidateQueries({ queryKey: ['schedules'] })
 */
export const scheduleQueries = {
  /**
   * All schedules query (with optional filtering)
   */
  all: (params?: {
    status?: 'ACTIVE' | 'PAUSED';
    deviceId?: string;
  }) =>
    queryOptions({
      queryKey: ['schedules', params?.status, params?.deviceId],
      queryFn: async () => {
        const result = await getSchedulesData({
          data: {
            status: params?.status,
            deviceId: params?.deviceId,
          },
        });
        if (!result.success) {
          throw new Error('Failed to fetch schedules');
        }
        return result.schedules || [];
      },
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Single schedule detail query
   */
  detail: (scheduleId: string) =>
    queryOptions({
      queryKey: ['schedule-detail', scheduleId],
      queryFn: async () => {
        const result = await getScheduleData({ data: { scheduleId } });
        if (!result.success) {
          throw new Error('Failed to fetch schedule');
        }
        return result.schedule;
      },
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),

  /**
   * Schedules for a specific device
   */
  forDevice: (deviceId: string) =>
    queryOptions({
      queryKey: ['device-schedules', deviceId],
      queryFn: async () => {
        const result = await getSchedulesForDeviceData({ data: { deviceId } });
        if (!result.success) {
          throw new Error('Failed to fetch device schedules');
        }
        return result.schedules || [];
      },
      ...QUERY_CONFIG.DEFAULTS.STABLE_DATA,
    }),
};

/**
 * Schedule mutation hooks (following TanStack Router best practice)
 *
 * Benefits:
 * - Centralized invalidation logic
 * - Reusable across components
 * - Type-safe
 * - Follows official TanStack pattern
 *
 * Usage in components:
 * const createMutation = useCreateScheduleMutation();
 * createMutation.mutate({ deviceId: '123', preset: 'STANDARD', ... });
 */

export const useCreateScheduleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['schedules', 'create'],
    mutationFn: (data: CreateScheduleInput) => createScheduleData({ data }),
    onSuccess: (result, variables) => {
      if (result.success) {
        // Invalidate all schedule queries
        queryClient.invalidateQueries({ queryKey: ['schedules'] });
        // Invalidate device-specific schedules
        queryClient.invalidateQueries({
          queryKey: ['device-schedules', variables.deviceId],
        });
      }
    },
  });
};

export const usePauseScheduleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['schedules', 'pause'],
    mutationFn: (data: { scheduleId: string }) => pauseScheduleData({ data }),

    // Optimistic update: Change status to PAUSED immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['schedules'] }),
        queryClient.cancelQueries({ queryKey: ['device-schedules'] }),
        queryClient.cancelQueries({ queryKey: ['schedule-detail', variables.scheduleId] }),
      ]);

      // Snapshot previous values
      const schedulesSnapshot = queryClient.getQueryData(['schedules']);
      const deviceSchedulesSnapshot = queryClient.getQueryData(['device-schedules']);
      const detailSnapshot = queryClient.getQueryData(['schedule-detail', variables.scheduleId]);

      // Optimistically update status to PAUSED
      const updateScheduleStatus = (old: any) => {
        if (!old) return old;

        const items = Array.isArray(old) ? old : old.schedules || old.items;
        if (!items) return old;

        const updated = items.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'PAUSED', isActive: false }
            : item
        );

        if (Array.isArray(old)) return updated;
        if (old.schedules) return { ...old, schedules: updated };
        return { ...old, items: updated };
      };

      queryClient.setQueriesData({ queryKey: ['schedules'] }, updateScheduleStatus);
      queryClient.setQueriesData({ queryKey: ['device-schedules'] }, updateScheduleStatus);
      queryClient.setQueryData(['schedule-detail', variables.scheduleId], (old: any) =>
        old ? { ...old, status: 'PAUSED', isActive: false } : old
      );

      return { schedulesSnapshot, deviceSchedulesSnapshot, detailSnapshot };
    },

    // Rollback on error
    onError: (_err, variables, context) => {
      if (context?.schedulesSnapshot) {
        queryClient.setQueryData(['schedules'], context.schedulesSnapshot);
      }
      if (context?.deviceSchedulesSnapshot) {
        queryClient.setQueryData(['device-schedules'], context.deviceSchedulesSnapshot);
      }
      if (context?.detailSnapshot) {
        queryClient.setQueryData(['schedule-detail', variables.scheduleId], context.detailSnapshot);
      }
    },

    // Refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['device-schedules'] });
    },
  });
};

export const useResumeScheduleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['schedules', 'resume'],
    mutationFn: (data: { scheduleId: string }) => resumeScheduleData({ data }),

    // Optimistic update: Change status to ACTIVE immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['schedules'] }),
        queryClient.cancelQueries({ queryKey: ['device-schedules'] }),
        queryClient.cancelQueries({ queryKey: ['schedule-detail', variables.scheduleId] }),
      ]);

      // Snapshot previous values
      const schedulesSnapshot = queryClient.getQueryData(['schedules']);
      const deviceSchedulesSnapshot = queryClient.getQueryData(['device-schedules']);
      const detailSnapshot = queryClient.getQueryData(['schedule-detail', variables.scheduleId]);

      // Optimistically update status to ACTIVE
      const updateScheduleStatus = (old: any) => {
        if (!old) return old;

        const items = Array.isArray(old) ? old : old.schedules || old.items;
        if (!items) return old;

        const updated = items.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 }
            : item
        );

        if (Array.isArray(old)) return updated;
        if (old.schedules) return { ...old, schedules: updated };
        return { ...old, items: updated };
      };

      queryClient.setQueriesData({ queryKey: ['schedules'] }, updateScheduleStatus);
      queryClient.setQueriesData({ queryKey: ['device-schedules'] }, updateScheduleStatus);
      queryClient.setQueryData(['schedule-detail', variables.scheduleId], (old: any) =>
        old ? { ...old, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 } : old
      );

      return { schedulesSnapshot, deviceSchedulesSnapshot, detailSnapshot };
    },

    // Rollback on error
    onError: (_err, variables, context) => {
      if (context?.schedulesSnapshot) {
        queryClient.setQueryData(['schedules'], context.schedulesSnapshot);
      }
      if (context?.deviceSchedulesSnapshot) {
        queryClient.setQueryData(['device-schedules'], context.deviceSchedulesSnapshot);
      }
      if (context?.detailSnapshot) {
        queryClient.setQueryData(['schedule-detail', variables.scheduleId], context.detailSnapshot);
      }
    },

    // Refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['device-schedules'] });
    },
  });
};

export const useDeleteScheduleMutation = () => {
  const queryClient = useQueryClient();

  // Optimistic delete: Update UI immediately, rollback on error
  const optimistic = createOptimisticScheduleDeleteHandlers([
    ['schedules'],
    ['device-schedules'],
  ]);

  return useMutation({
    mutationKey: ['schedules', 'delete'],
    mutationFn: (data: { scheduleId: string }) => deleteScheduleData({ data }),
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};
