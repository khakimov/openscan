import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { invalidateTRPCQuery } from '@/lib/query-utils';
import { toast } from 'sonner';
import type { NormalizedSchedule } from '@/features/schedules/utils/normalize-schedule';

/**
 * Schedule query key factory (tRPC pattern)
 *
 * Usage:
 * - Use `.base` for invalidating all queries of a type: `invalidateKeys: [scheduleQueries.list.base]`
 * - Use `.key()` for specific query operations: `queryClient.setQueryData(scheduleQueries.detail.key(scheduleId), data)`
 *
 * Pattern:
 * - `base`: Simple path like `['schedule', 'list']` - use for invalidation (matches all params)
 * - `key()`: Full tRPC tuple like `[['schedule', 'list'], { input: {...} }]` - use for specific cache operations
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
    base: ['schedule', 'listByDevice'] as const,
    key: (deviceId: string) => [
      ['schedule', 'listByDevice'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
  detail: {
    base: ['schedule', 'detail'] as const,
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
  return useQuery(trpc.schedule.list.queryOptions(params));
};

export const useScheduleListByDevice = (deviceId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.schedule.listByDevice.queryOptions({ deviceId }));
};

export const useScheduleDetail = (scheduleId: string) => {
  const trpc = useTRPC();
  return useQuery(trpc.schedule.detail.queryOptions({ scheduleId }));
};

/**
 * Schedule mutation hooks
 *
 * Pattern reference (see docs/optimistic-ui.md):
 * - Pattern 1 (Simple Invalidation): For create and delete
 * - Pattern 2 (Inline Optimistic): For pause/resume (status changes visible in UI)
 */

/**
 * Create schedule input type
 */
export interface CreateScheduleInput {
  deviceId: string;
  preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
  scheduleFrequency: 'EVERY_30_MINUTES' | 'EVERY_HOUR' | 'EVERY_6_HOURS' | 'EVERY_12_HOURS' | 'DAILY';
  dailyTime?: string;
  startImmediately?: boolean;
}

/**
 * Create schedule result type
 */
export interface CreateScheduleResult {
  success: boolean;
  schedule: NormalizedSchedule;
  error?: string;
  restateFailed?: boolean; // Set when DB succeeds but Restate timer fails
}

/**
 * Build interval label from frequency config
 */
function buildIntervalLabel(input: CreateScheduleInput): string {
  const { scheduleFrequency, dailyTime } = input;
  
  switch (scheduleFrequency) {
    case 'EVERY_30_MINUTES':
      return 'Every 30 minutes';
    case 'EVERY_HOUR':
      return 'Every hour';
    case 'EVERY_6_HOURS':
      return 'Every 6 hours';
    case 'EVERY_12_HOURS':
      return 'Every 12 hours';
    case 'DAILY':
      return `Daily at ${dailyTime || '02:00'} UTC`;
    default:
      return 'Unknown interval';
  }
}

/**
 * Create optimistic schedule object for immediate UI feedback
 */
function createOptimisticSchedule(
  input: CreateScheduleInput,
  scheduleId: string,
  organizationId: string
): NormalizedSchedule {
  const now = new Date();
  const nextRunAt = input.startImmediately 
    ? now 
    : new Date(now.getTime() + 60 * 60 * 1000); // Default to 1 hour if not immediate

  return {
    id: scheduleId,
    scheduleId,
    deviceId: input.deviceId,
    organizationId,
    preset: input.preset,
    interval: buildIntervalLabel(input),
    status: 'ACTIVE',
    isActive: true,
    nextRunAt: nextRunAt.toISOString(),
    lastRunAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: null,
    _isPending: true, // Internal flag for optimistic pending state
  };
}

/**
 * Context type for create schedule mutation (for optimistic updates)
 */
interface CreateScheduleContext {
  previousQueries: [QueryKey, unknown][];
  tempScheduleId: string;
  variables: CreateScheduleInput;
}

/**
 * Create schedule - Pattern 1 + Optimistic Update
 * 
 * Adds schedule to list immediately with pending state, updates when server confirms.
 * Handles partial success (DB ok, Restate failed) with warning toast + resume action.
 */
export const useCreateScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast<CreateScheduleResult, CreateScheduleInput, CreateScheduleContext>({
    mutationKey: ['schedule', 'create'],
    mutationFn: (data) => trpcClient.schedule.create.mutate(data),
    successMessage: undefined, // Handled in onSuccess to support partial success
    toastOnSuccess: false,
    invalidateKeys: [scheduleQueries.list.base],

    // Optimistic update: Add pending schedule to list immediately
    onMutate: async (variables) => {
      // Generate deterministic temp ID for correlation
      const tempScheduleId = `temp-schedule-${variables.deviceId}-${Date.now()}`;
      
      // Cancel in-flight queries to prevent race conditions
      await queryClient.cancelQueries({ 
        queryKey: scheduleQueries.listByDevice.base 
      });

      // Snapshot previous data for rollback
      const previousQueries = queryClient.getQueriesData({ 
        queryKey: scheduleQueries.listByDevice.base 
      });

      // Get current organization ID from context (stored in query data)
      // We need this for the optimistic object
      const orgId = await queryClient.getQueryData(['auth', 'organization']) as string | undefined ?? '';

      // Create optimistic schedule
      const optimisticSchedule = createOptimisticSchedule(
        variables,
        tempScheduleId,
        orgId
      );

      // Add to all device schedule lists
      queryClient.setQueriesData(
        { queryKey: scheduleQueries.listByDevice.base },
        (old: any) => {
          if (!old) return [optimisticSchedule];
          if (!Array.isArray(old)) return old;
          return [...old, optimisticSchedule];
        }
      );

      return { previousQueries, tempScheduleId, variables };
    },

    // Handle success - replace optimistic with real data
    onSuccess: async (result, _variables, context) => {
      if (!context) return;

      const { tempScheduleId } = context as CreateScheduleContext;

      if (result.success) {
        // Full success - replace optimistic schedule with real one
        queryClient.setQueriesData(
          { queryKey: scheduleQueries.listByDevice.base },
          (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map((schedule: NormalizedSchedule) =>
              schedule.scheduleId === tempScheduleId
                ? { ...result.schedule, _isPending: false }
                : schedule
            );
          }
        );

        // Show success toast
        toast.success('Scan schedule created successfully', {
          description: `${result.schedule.preset} scan scheduled`,
        });
      } else if (result.restateFailed) {
        // Partial success - DB record exists but Restate timer failed
        queryClient.setQueriesData(
          { queryKey: scheduleQueries.listByDevice.base },
          (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map((schedule: NormalizedSchedule) =>
              schedule.scheduleId === tempScheduleId
                ? { 
                    ...result.schedule, 
                    _isPending: false,
                    status: 'PAUSED',
                    isActive: false,
                  }
                : schedule
            );
          }
        );

        // Show warning toast with resume action
        toast.warning('Schedule created but not active', {
          description: result.error || 'Timer service unavailable. Click to resume.',
          action: {
            label: 'Resume',
            onClick: () => {
              // Resume mutation will be handled by the caller if needed
              toast.info('Resume schedule', {
                description: 'Use the resume button in the schedule list to activate.',
              });
            },
          },
          duration: 10000, // 10 seconds to read and act
        });
      } else {
        // Complete failure - remove optimistic schedule
        queryClient.setQueriesData(
          { queryKey: scheduleQueries.listByDevice.base },
          (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.filter((schedule: NormalizedSchedule) => 
              schedule.scheduleId !== tempScheduleId
            );
          }
        );

        // Show error toast
        toast.error('Failed to create schedule', {
          description: result.error || 'Please try again',
        });
      }

      // Invalidate specific device schedules to ensure consistency
      await queryClient.invalidateQueries(
        invalidateTRPCQuery(scheduleQueries.listByDevice.base)
      );
    },

    // Rollback on error - restore snapshot (error toast shown by useMutationWithToast)
    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousQueries } = context as CreateScheduleContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Context type for pause schedule mutation (for optimistic updates)
 */
interface PauseScheduleContext {
  previousQueries: [QueryKey, unknown][];
}

/**
 * Pause schedule - Pattern 1 + Optimistic Update
 */
export const usePauseScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast<{ success: boolean }, { scheduleId: string }, PauseScheduleContext>({
    mutationKey: ['schedule', 'pause'],
    mutationFn: (data) => trpcClient.schedule.pause.mutate(data),
    successMessage: 'Schedule paused successfully',
    invalidateKeys: [scheduleQueries.list.base],

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: scheduleQueries.list.base });

      const previousQueries = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'PAUSED', isActive: false }
            : item
        );
      });

      return { previousQueries };
    },

    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousQueries } = context as PauseScheduleContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Context type for resume schedule mutation (for optimistic updates)
 */
interface ResumeScheduleContext {
  previousQueries: [QueryKey, unknown][];
}

/**
 * Resume schedule - Pattern 1 + Optimistic Update
 */
export const useResumeScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast<{ success: boolean }, { scheduleId: string }, ResumeScheduleContext>({
    mutationKey: ['schedule', 'resume'],
    mutationFn: (data) => trpcClient.schedule.resume.mutate(data),
    successMessage: 'Schedule resumed successfully',
    invalidateKeys: [scheduleQueries.list.base],

    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: scheduleQueries.list.base });

      const previousQueries = queryClient.getQueriesData({ queryKey: scheduleQueries.list.base });

      queryClient.setQueriesData({ queryKey: scheduleQueries.list.base }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: any) =>
          item.scheduleId === variables.scheduleId
            ? { ...item, status: 'ACTIVE', isActive: true, consecutiveFailures: 0 }
            : item
        );
      });

      return { previousQueries };
    },

    onError: (_err, _variables, context) => {
      if (!context) return;
      const { previousQueries } = context as ResumeScheduleContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Delete schedule - Pattern 1 + Optimistic Update
 * 
 * Removes schedule from list immediately for better UX.
 */
export const useDeleteScheduleMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['schedule', 'delete'],
    mutationFn: (data: { scheduleId: string }) =>
      trpcClient.schedule.delete.mutate(data),
    successMessage: 'Schedule deleted successfully',
    invalidateKeys: [scheduleQueries.list.base],

    // Optimistic update: Remove from list immediately
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ 
        queryKey: scheduleQueries.listByDevice.base 
      });

      const previousQueries = queryClient.getQueriesData({ 
        queryKey: scheduleQueries.listByDevice.base 
      });

      queryClient.setQueriesData(
        { queryKey: scheduleQueries.listByDevice.base },
        (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.filter((item: any) => 
            item.scheduleId !== variables.scheduleId
          );
        }
      );

      return { previousQueries, deletedScheduleId: variables.scheduleId };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      context?.previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};
