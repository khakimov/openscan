import type { QueryClient } from '@tanstack/react-query';

/**
 * Optimistic update helpers for TanStack Query mutations
 * Based on TanStack Query best practices for optimistic updates
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
 */

/**
 * Creates optimistic delete handlers for mutations
 *
 * Handles:
 * - Cancel in-flight queries to prevent race conditions
 * - Snapshot previous state for rollback
 * - Optimistically remove item from cache
 * - Rollback on error
 * - Refetch after completion
 *
 * @param queryKeys - Array of query keys to update (e.g., [['devices'], ['devices', deviceId]])
 * @returns Object with onMutate, onError, onSettled handlers to spread into useMutation
 *
 * @example
 * ```ts
 * const optimistic = createOptimisticDeleteHandlers([['devices']]);
 *
 * export const useDeleteDeviceMutation = () => {
 *   const queryClient = useQueryClient();
 *   return useMutation({
 *     mutationFn: deleteDevice,
 *     onMutate: (vars) => optimistic.onMutate(vars, queryClient),
 *     onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
 *     onSettled: () => optimistic.onSettled(queryClient),
 *   });
 * };
 * ```
 */
export const createOptimisticDeleteHandlers = <T extends { id: string }>(
  queryKeys: unknown[][],
) => ({
  /**
   * onMutate: Run before mutation executes
   * - Cancel queries to prevent race conditions
   * - Snapshot current data for rollback
   * - Optimistically update cache (remove item)
   */
  onMutate: async (
    variables: { deviceId?: string; id?: string },
    queryClient: QueryClient,
  ) => {
    // Support both {deviceId} and {id} patterns
    const id = variables.deviceId || variables.id;
    if (!id) {
      console.warn('createOptimisticDeleteHandlers: No id found in variables', variables);
      return;
    }

    // Cancel any outgoing refetches (prevent race conditions)
    await Promise.all(queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));

    // Snapshot the previous value for ALL query keys
    const snapshots = queryKeys.map((key) => ({
      key,
      data: queryClient.getQueryData(key),
    }));

    // Optimistically remove the item from ALL query caches
    queryKeys.forEach((key) => {
      queryClient.setQueriesData({ queryKey: key }, (old: any) => {
        if (!old) return old;

        // Handle both array format and { items: [] } format
        const items = Array.isArray(old) ? old : old.items;
        if (!items) return old;

        const filtered = items.filter((item: T) => item.id !== id);

        // Return in same format as input
        return Array.isArray(old) ? filtered : { ...old, items: filtered };
      });
    });

    // Return context for onError and onSettled
    return { snapshots, deletedId: id };
  },

  /**
   * onError: Run if mutation fails
   * - Rollback to snapshot
   */
  onError: (
    _err: unknown,
    _variables: unknown,
    context: { snapshots?: Array<{ key: unknown[]; data: unknown }> } | undefined,
    queryClient: QueryClient,
  ) => {
    // Rollback: restore all snapshots
    context?.snapshots?.forEach(({ key, data }) => {
      queryClient.setQueryData(key, data);
    });
  },

  /**
   * onSettled: Run after mutation completes (success or error)
   * - Refetch to ensure consistency with server
   */
  onSettled: (queryClient: QueryClient) => {
    // Invalidate all queries to refetch from server
    queryKeys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  },
});

/**
 * Creates optimistic delete handlers for schedules (uses scheduleId instead of id)
 *
 * Same as createOptimisticDeleteHandlers but matches on scheduleId field
 *
 * @param queryKeys - Array of query keys to update (e.g., [['schedules'], ['device-schedules', deviceId]])
 * @returns Object with onMutate, onError, onSettled handlers to spread into useMutation
 *
 * @example
 * ```ts
 * const optimistic = createOptimisticScheduleDeleteHandlers([['schedules']]);
 *
 * export const useDeleteScheduleMutation = () => {
 *   const queryClient = useQueryClient();
 *   return useMutation({
 *     mutationFn: deleteSchedule,
 *     onMutate: (vars) => optimistic.onMutate(vars, queryClient),
 *     onError: (err, vars, ctx) => optimistic.onError(err, vars, ctx, queryClient),
 *     onSettled: () => optimistic.onSettled(queryClient),
 *   });
 * };
 * ```
 */
export const createOptimisticScheduleDeleteHandlers = <T extends { scheduleId: string }>(
  queryKeys: unknown[][],
) => ({
  /**
   * onMutate: Run before mutation executes
   * - Cancel queries to prevent race conditions
   * - Snapshot current data for rollback
   * - Optimistically update cache (remove schedule)
   */
  onMutate: async (
    variables: { scheduleId: string },
    queryClient: QueryClient,
  ) => {
    const { scheduleId } = variables;
    if (!scheduleId) {
      console.warn('createOptimisticScheduleDeleteHandlers: No scheduleId found in variables', variables);
      return;
    }

    // Cancel any outgoing refetches (prevent race conditions)
    await Promise.all(queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key })));

    // Snapshot the previous value for ALL query keys
    const snapshots = queryKeys.map((key) => ({
      key,
      data: queryClient.getQueryData(key),
    }));

    // Optimistically remove the schedule from ALL query caches
    queryKeys.forEach((key) => {
      queryClient.setQueriesData({ queryKey: key }, (old: any) => {
        if (!old) return old;

        // Handle both array format and { items: [] } format
        const items = Array.isArray(old) ? old : old.schedules || old.items;
        if (!items) return old;

        const filtered = items.filter((item: T) => item.scheduleId !== scheduleId);

        // Return in same format as input
        if (Array.isArray(old)) {
          return filtered;
        } else if (old.schedules) {
          return { ...old, schedules: filtered };
        } else {
          return { ...old, items: filtered };
        }
      });
    });

    // Return context for onError and onSettled
    return { snapshots, deletedScheduleId: scheduleId };
  },

  /**
   * onError: Run if mutation fails
   * - Rollback to snapshot
   */
  onError: (
    _err: unknown,
    _variables: unknown,
    context: { snapshots?: Array<{ key: unknown[]; data: unknown }> } | undefined,
    queryClient: QueryClient,
  ) => {
    // Rollback: restore all snapshots
    context?.snapshots?.forEach(({ key, data }) => {
      queryClient.setQueryData(key, data);
    });
  },

  /**
   * onSettled: Run after mutation completes (success or error)
   * - Refetch to ensure consistency with server
   */
  onSettled: (queryClient: QueryClient) => {
    // Invalidate all queries to refetch from server
    queryKeys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  },
});

