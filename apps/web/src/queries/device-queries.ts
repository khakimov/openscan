import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTRPCClient } from '@/integrations/trpc/react';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

import { invalidateTRPCQuery } from '@/lib/query-utils';

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
 * Delete device - Pattern 1: Simple Invalidation
 */
export const useDeleteDeviceMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['device', 'delete'],
    mutationFn: (data: { deviceId: string }) =>
      trpcClient.device.remove.mutate(data),
    successMessage: 'Device deleted successfully',
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base],
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
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base],

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
      const updater = (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d: any) =>
            d.id === variables.deviceId
              ? { ...d, verificationStatus: variables.status }
              : d
          ),
        };
      };
      queryClient.setQueriesData({ queryKey: deviceQueries.list.base }, updater);
      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, updater);

      return { previousListQueries, previousDetailQueries };
    },

    // Rollback on error
    onError: (_err, _vars, context) => {
      context?.previousListQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      context?.previousDetailQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
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
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base],

    // Optimistic update: Toggle status immediately
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: deviceQueries.list.base }),
        queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base }),
      ]);

      const previousListQueries = queryClient.getQueriesData({ queryKey: deviceQueries.list.base });
      const previousDetailQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      const updater = (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d: any) =>
            d.id === variables.deviceId
              ? { ...d, verificationStatus: variables.verify ? 'VERIFIED' : 'CANDIDATE' }
              : d
          ),
        };
      };
      queryClient.setQueriesData({ queryKey: deviceQueries.list.base }, updater);
      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, updater);

      return { previousListQueries, previousDetailQueries };
    },

    onError: (_err, _vars, context) => {
      context?.previousListQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
      context?.previousDetailQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
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
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base],
    toastOnSuccess: false,

    // Optimistic update: inject pending scan into listWithDetails cache
    // so DeviceListProvider sees activeScans immediately (no flash to "Scanned")
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: deviceQueries.listWithDetails.base });

      const previousQueries = queryClient.getQueriesData({ queryKey: deviceQueries.listWithDetails.base });

      queryClient.setQueriesData({ queryKey: deviceQueries.listWithDetails.base }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((d: any) =>
            d.id === variables.deviceId
              ? { ...d, activeScans: [...(d.activeScans ?? []), `pending-${variables.deviceId}`] }
              : d
          ),
        };
      });

      return { previousQueries };
    },

    onError: (_err, _vars, context) => {
      context?.previousQueries?.forEach(([key, data]: [QueryKey, unknown]) => {
        queryClient.setQueryData(key, data);
      });
    },
  });
};

/**
 * Create devices from discovery - Pattern 1: Simple Invalidation
 */
export const useCreateDevicesFromDiscoveryMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

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
    successMessage: (response) =>
      `Added ${response.count} ${response.count === 1 ? 'device' : 'devices'}`,
    invalidateKeys: [deviceQueries.list.base, deviceQueries.listWithDetails.base],
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [['onboarding', 'status'], { input: undefined, type: 'query' as const }] });
      await queryClient.invalidateQueries(
        invalidateTRPCQuery(['onboarding', 'discoveryDevices'])
      );
    },
  });
};
