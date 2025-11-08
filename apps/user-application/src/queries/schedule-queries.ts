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
    onSuccess: (result, variables) => {
      if (result.success) {
        // Invalidate all schedule queries
        queryClient.invalidateQueries({ queryKey: ['schedules'] });
        // Invalidate specific schedule detail
        queryClient.invalidateQueries({
          queryKey: ['schedule-detail', variables.scheduleId],
        });
      }
    },
  });
};

export const useResumeScheduleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['schedules', 'resume'],
    mutationFn: (data: { scheduleId: string }) => resumeScheduleData({ data }),
    onSuccess: (result, variables) => {
      if (result.success) {
        // Invalidate all schedule queries
        queryClient.invalidateQueries({ queryKey: ['schedules'] });
        // Invalidate specific schedule detail
        queryClient.invalidateQueries({
          queryKey: ['schedule-detail', variables.scheduleId],
        });
      }
    },
  });
};

export const useDeleteScheduleMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['schedules', 'delete'],
    mutationFn: (data: { scheduleId: string }) => deleteScheduleData({ data }),
    onSuccess: (result, variables) => {
      if (result.success) {
        // Invalidate all schedule queries
        queryClient.invalidateQueries({ queryKey: ['schedules'] });
        // Invalidate specific schedule detail
        queryClient.invalidateQueries({
          queryKey: ['schedule-detail', variables.scheduleId],
        });
      }
    },
  });
};
