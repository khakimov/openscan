import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTRPCClient } from '@/integrations/trpc/react';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { toast } from 'sonner';
import type { inferRouterOutputs } from '@trpc/server';

import { invalidateTRPCQuery } from '@/lib/query-utils';
import type { AppRouter } from '@/trpc/router';

/**
 * Device query key factory (tRPC pattern)
 *
 * Usage:
 * - Use `.base` for invalidating all queries of a type: `invalidateKeys: [deviceQueries.list.base]`
 * - Use `.key()` for specific query operations: `queryClient.setQueryData(deviceQueries.detail.key(deviceId), data)`
 *
 * Pattern:
 * - `base`: Simple path like `['device', 'list']` - use for invalidation (matches all params)
 * - `key()`: Full tRPC tuple like `[['device', 'list'], { input: {...} }]` - use for specific cache operations
 */
// ============================================================================
// Types
// ============================================================================

/** tRPC device router output types */
type DeviceRouterOutputs = inferRouterOutputs<AppRouter>['device'];

/** Device with details returned by listWithDetails query */
type DeviceWithDetails = DeviceRouterOutputs['listWithDetails']['items'][number];

/** Response shape for listWithDetails queries (used in optimistic updates) */
interface DeviceListResponse {
  items: DeviceWithDetails[];
  totalCount: number;
  counts?: {
    total: number;
    candidate: number;
    verified: number;
    excluded: number;
  };
}

/** Shared context type for simple device mutations */
interface DeviceMutationContext {
  previousQueries: [QueryKey, unknown][];
}

/** Context for mutations that affect both list and listWithDetails */
interface DeviceDualListContext {
  previousListQueries: [QueryKey, unknown][];
  previousDetailQueries: [QueryKey, unknown][];
}

// ============================================================================
// Query Keys
// ============================================================================

export const deviceQueries = {
  list: {
    base: ['device', 'list'] as const,
    key: (params?: {
      verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | ('CANDIDATE' | 'VERIFIED' | 'EXCLUDED')[];
      projectId?: string;
      page?: number;
      pageSize?: number;
      sortColumn?: string;
      sortDirection?: 'asc' | 'desc';
    }) => [
      ['device', 'list'],
      { input: params || {}, type: 'query' as const }
    ] as const,
  },
  listWithDetails: {
    base: ['device', 'listWithDetails'] as const,
  },
  counts: {
    base: ['device', 'counts'] as const,
  },
  detail: {
    key: (deviceId: string) => [
      ['device', 'detail'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
  scanHistory: {
    key: (deviceId: string, limit = 10) => [
      ['device', 'scanHistory'],
      { input: { deviceId, limit }, type: 'query' as const }
    ] as const,
  },
  vulnerabilities: {
    key: (deviceId: string, page = 1) => [
      ['device', 'vulnerabilities'],
      { input: { deviceId, page }, type: 'query' as const }
    ] as const,
  },
  tagSuggestions: {
    key: () => [
      ['device', 'tagSuggestions'],
      { input: undefined, type: 'query' as const }
    ] as const,
  },
  activeScans: {
    // Base key for invalidating all active scan queries
    base: ['device', 'activeScans'] as const,
    // Specific key for a query with deviceId
    key: (deviceId: string) => [
      ['device', 'activeScans'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
};

/**
 * Device mutation hooks
 *
 * Pattern reference (see docs/optimistic-ui.md):
 * - Pattern 1 (Simple Invalidation): For create, delete, and complex updates
 * - Pattern 2 (Inline Optimistic): For status toggles and high-frequency operations
 */

/**
 * Delete device - Optimistic: Remove from list immediately
 */
export const useDeleteDeviceMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'delete'],
    mutationFn: (data: { deviceId: string }) =>
      trpcClient.device.remove.mutate(data),
    successMessage: 'Device deleted successfully',
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],

    // Optimistic update: Remove device from list immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base });

      // Snapshot previous data for rollback
      const previousQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      // Optimistically remove device from all list queries
      queryClient.setQueriesData(
        { queryKey: deviceQueries.listWithDetails.base },
        (old: DeviceListResponse | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((d) => d.id !== variables.deviceId),
            // Decrement total count
            totalCount: Math.max(0, (old.totalCount ?? 0) - 1),
          };
        }
      );

      return { previousQueries } as DeviceMutationContext;
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previousQueries } = context as DeviceMutationContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Update device - Pattern 1: Simple Invalidation
 */
export const useUpdateDeviceMutation = (deviceId: string) => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['device', 'update', deviceId],
    mutationFn: async (data: {
      deviceId: string;
      updates: {
        name?: string;
        ip?: string;
        state?: string;
        scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
        source?: string;
        isScanned?: boolean;
        respondsToPing?: boolean;
        tags?: string[];
        notes?: string;
      };
    }) => {
      const response = await trpcClient.device.update.mutate(data);
      if (!response.success) {
        throw new Error('Failed to update device');
      }
      return response;
    },
    successMessage: 'Device updated successfully',
    invalidateKeys: [
      deviceQueries.list.base,
      deviceQueries.listWithDetails.base,
      deviceQueries.counts.base,
      deviceQueries.detail.key(deviceId),
      deviceQueries.tagSuggestions.key(),
    ],
  });
};

/**
 * Verify device - Pattern 2: Inline Optimistic Update
 *
 * This affects tab visibility (Discovery → Verified), so optimistic update
 * provides better UX. The device should immediately move to the new tab.
 */
export const useVerifyDeviceMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'verify'],
    mutationFn: async (data: {
      deviceId: string;
      status: 'VERIFIED' | 'EXCLUDED' | 'CANDIDATE';
      note?: string;
    }) => {
      const response = await trpcClient.device.verify.mutate(data);
      if (!response.success) {
        throw new Error('Failed to verify device');
      }
      return response;
    },
    successMessage: 'Device verification updated',
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],

    // Optimistic update: Change status immediately
    onMutate: async (variables) => {
      // Cancel in-flight queries for both list endpoints
      await Promise.all([
        queryClient.cancelQueries({ queryKey: deviceQueries.list.base }),
        queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base }),
      ]);

      // Snapshot for rollback (both list and listWithDetails)
      const previousListQueries = queryClient.getQueriesData({ queryKey: deviceQueries.list.base });
      const previousDetailQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      // Optimistically update both query types
      const updater = (old: DeviceListResponse | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d) =>
            d.id === variables.deviceId
              ? { ...d, verificationStatus: variables.status }
              : d
          ),
        };
      };
      queryClient.setQueriesData({ queryKey: deviceQueries.list.base }, updater);
      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, updater);

      return { previousListQueries, previousDetailQueries } as DeviceDualListContext;
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previousListQueries, previousDetailQueries } = context as DeviceDualListContext;
      previousListQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      previousDetailQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Toggle device verification - Pattern 2: Inline Optimistic Update
 */
export const useToggleDeviceVerificationMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'toggle-verification'],
    mutationFn: async (data: {
      deviceId: string;
      verify: boolean;
      interval?: string;
      note?: string;
    }) => {
      const response = await trpcClient.device.toggleVerification.mutate(data);
      if (!response.success) {
        throw new Error('Failed to toggle verification');
      }
      return response;
    },
    successMessage: (response) => response.verified ? 'Device verified' : 'Device unverified',
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],

    // Optimistic update: Toggle status immediately
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: deviceQueries.list.base }),
        queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base }),
      ]);

      const previousListQueries = queryClient.getQueriesData({ queryKey: deviceQueries.list.base });
      const previousDetailQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      const updater = (old: DeviceListResponse | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d) =>
            d.id === variables.deviceId
              ? { ...d, verificationStatus: variables.verify ? 'VERIFIED' : 'CANDIDATE' }
              : d
          ),
        };
      };
      queryClient.setQueriesData({ queryKey: deviceQueries.list.base }, updater);
      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, updater);

      return { previousListQueries, previousDetailQueries } as DeviceDualListContext;
    },

    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previousListQueries, previousDetailQueries } = context as DeviceDualListContext;
      previousListQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      previousDetailQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Start device scan - Pattern 2: Inline Optimistic Update
 */
export const useStartDeviceScanMutation = (deviceId: string) => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'scan', deviceId],
    mutationFn: (data: { deviceId: string; target: string; preset: 'QUICK' | 'STANDARD' | 'THOROUGH' }) =>
      trpcClient.device.startScan.mutate(data),
    successMessage: 'Scan started successfully',
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],
    toastOnSuccess: false,

    // Optimistic update: inject pending scan into listWithDetails cache
    // so DeviceListProvider sees activeScans immediately (no flash to "Scanned")
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base });

      const previousQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, (old: DeviceListResponse | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d) =>
            d.id === variables.deviceId
              ? { ...d, activeScans: [...(d.activeScans ?? []), `pending-${variables.deviceId}`] }
              : d
          ),
        };
      });

      return { previousQueries } as DeviceMutationContext;
    },

    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previousQueries } = context as DeviceMutationContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Shared optimistic update logic for device creation mutations.
 * Adds skeleton devices to the listWithDetails cache immediately.
 */
function createSkeletonDevicesOptimisticUpdate(queryClient: ReturnType<typeof useQueryClient>) {
  return async (variables: {
    targets: Array<{ host: string; ip?: string }>;
    projectId: string;
    options?: {
      source?: string;
      scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
      verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
    };
  }) => {
    await queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base });
    const previousQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

    const tempDevices = variables.targets.map((target, index) => ({
      id: `temp-${Date.now()}-${index}`,
      name: target.host,
      ip: target.ip || null,
      projectId: variables.projectId,
      organizationId: '',
      verificationStatus: variables.options?.verificationStatus || 'CANDIDATE',
      discoveredAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isScanned: false,
      respondsToPing: null,
      riskLevel: 'UNKNOWN',
      state: null,
      status: 'pending',
      scope: variables.options?.scope || 'EXTERNAL',
      source: variables.options?.source || 'MANUAL',
      tags: [],
      activeScans: [],
      scanHistory: [],
      _isPending: true,
    }));

    queryClient.setQueriesData(
      { queryKey: deviceQueries.listWithDetails.base },
      (old: DeviceListResponse | undefined) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: [...tempDevices, ...old.items],
          totalCount: (old.totalCount ?? 0) + tempDevices.length,
        };
      }
    );

    return { previousQueries, tempDeviceIds: tempDevices.map(d => d.id) };
  };
}

interface UseCreateDevicesFromDiscoveryMutationOptions {
  /** Disable built-in toasts for custom toast handling (e.g., modal closes early) */
  disableToasts?: boolean;
}

/**
 * Create devices from discovery - Pattern 1: Simple Invalidation
 *
 * @param options - Optional configuration for the mutation
 * @returns Mutation object with mutate function
 *
 * @example
 * // Default usage (with built-in toasts)
 * const mutation = useCreateDevicesFromDiscoveryMutation();
 *
 * @example
 * // Custom toast handling (modal closes early, shows loading toast)
 * const mutation = useCreateDevicesFromDiscoveryMutation({ disableToasts: true });
 * // Then in your component:
 * // toast.loading('Adding...', { id: toastId });
 * // mutation.mutate(data, {
 * //   onSuccess: () => toast.success('Added', { id: toastId }),
 * //   onError: () => toast.error('Failed', { id: toastId }),
 * // });
 */
export const useCreateDevicesFromDiscoveryMutation = (
  options: UseCreateDevicesFromDiscoveryMutationOptions = {}
) => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const { disableToasts = false } = options;

  return useMutationWithToast({
    mutationKey: ['device', 'create-from-discovery'],
    mutationFn: async (data: {
      targets: Array<{ host: string; ip?: string }>;
      projectId: string;
      options?: {
        source?: string;
        scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
        verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
      };
    }) => {
      const response = await trpcClient.device.createFromDiscovery.mutate(data);
      if (!response.success) {
        throw new Error('Failed to create devices');
      }
      return response;
    },
    successMessage: disableToasts
      ? undefined
      : (response) =>
          `Added ${response.count} ${response.count === 1 ? 'device' : 'devices'}`,
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],
    toastOnSuccess: !disableToasts,
    toastOnError: !disableToasts,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [['onboarding', 'status'], { input: undefined, type: 'query' as const }] });
      await queryClient.invalidateQueries(
        invalidateTRPCQuery(['onboarding', 'discoveryDevices'])
      );
    },

    onMutate: createSkeletonDevicesOptimisticUpdate(queryClient),

    // On error, remove skeleton devices
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previousQueries } = context as DeviceMutationContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Create devices from discovery with deferred toast (modal closes immediately)
 * 
 * This version shows a loading toast that stays visible while the modal closes,
 * then updates to success/error when complete. Provides better UX for bulk operations.
 *
 * @returns Mutation object with mutateAsync that returns a toastId for tracking
 *
 * @example
 * const mutation = useCreateDevicesFromDiscoveryWithToast();
 * 
 * // In your component:
 * const toastId = toast.loading(`Adding ${targets.length} devices...`);
 * mutation.mutate(
 *   { targets, projectId, toastId },
 *   {
 *     onSuccess: (response) => {
 *       toast.success(`Added ${response.count} devices`, { id: toastId });
 *       popModal();
 *     },
 *     onError: (error) => {
 *       toast.error(`Failed: ${error.message}`, { id: toastId });
 *     },
 *   }
 * );
 */
export const useCreateDevicesFromDiscoveryWithToast = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'create-from-discovery', 'with-toast'],
    mutationFn: async (data: {
      targets: Array<{ host: string; ip?: string }>;
      projectId: string;
      toastId: string | number;
      options?: {
        source?: string;
        scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
        verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
      };
    }) => {
      const { toastId: _, ...apiData } = data;
      const response = await trpcClient.device.createFromDiscovery.mutate(apiData);
      if (!response.success) {
        throw new Error('Failed to create devices');
      }
      return response;
    },
    // No built-in toasts - caller manages them
    successMessage: undefined,
    toastOnSuccess: false,
    toastOnError: false,
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base, deviceQueries.counts.base],
    onSuccess: async (_data, variables) => {
      // Update the loading toast to success
      toast.success(
        `Added ${_data.count} ${_data.count === 1 ? 'device' : 'devices'} to inventory`,
        { id: variables.toastId }
      );

      // Invalidate queries
      await queryClient.invalidateQueries({ queryKey: [['onboarding', 'status'], { input: undefined, type: 'query' as const }] });
      await queryClient.invalidateQueries(
        invalidateTRPCQuery(['onboarding', 'discoveryDevices'])
      );
    },
    onMutate: createSkeletonDevicesOptimisticUpdate(queryClient),

    // On error, update toast and remove skeleton devices
    onError: (error, variables, context) => {
      // Update the loading toast to error
      toast.error(
        error instanceof Error ? error.message : 'Failed to add devices',
        { id: variables.toastId }
      );
      
      // Rollback optimistic update
      if (!context) return;
      const { previousQueries } = context as DeviceMutationContext;
      previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};
