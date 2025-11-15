import { useQueryClient } from '@tanstack/react-query';
import { useTRPCClient } from '@/integrations/trpc/react';
import { createOptimisticDeleteHandlers } from '@/lib/optimistic-updates';
import { onboardingStatusQueryKey } from '@/queries/onboarding-queries';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

/**
 * NOTE: This file will be migrated to use loaders/components accessing tRPC directly
 * For now, it provides backward-compatible query helpers that delegate to tRPC
 *
 * The final pattern should be:
 * - Loaders: await context.queryClient.ensureQueryData(context.trpc.device.detail.queryOptions({ deviceId }))
 * - Components: useQuery(trpc.device.detail.queryOptions({ deviceId }))
 */

/**
 * Centralized device query key factory (tRPC pattern)
 *
 * Benefits:
 * - Single source of truth for query keys
 * - Easy invalidation in mutations
 * - Consistent keys across loaders and components
 * - tRPC-compatible tuple structure
 */
export const deviceQueries = {
  /**
   * Device list query keys (tRPC-compatible)
   */
  list: {
    // Base key for all device list queries (for invalidation)
    all: [['device', 'list']] as const,

    // Base procedure path (for optimistic updates - avoids map() allocation)
    base: ['device', 'list'] as const,

    // Specific key for a query with params
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

  /**
   * Single device detail query key (tRPC-compatible)
   */
  detail: {
    key: (deviceId: string) => [
      ['device', 'detail'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },

  /**
   * Device scan history query key (tRPC-compatible)
   */
  scanHistory: {
    key: (deviceId: string, limit = 10) => [
      ['device', 'scanHistory'],
      { input: { deviceId, limit }, type: 'query' as const }
    ] as const,
  },

  /**
   * Device vulnerabilities query key (tRPC-compatible)
   */
  vulnerabilities: {
    key: (deviceId: string, page = 1) => [
      ['device', 'vulnerabilities'],
      { input: { deviceId, page }, type: 'query' as const }
    ] as const,
  },

  /**
   * Tag suggestions query key (tRPC-compatible)
   */
  tagSuggestions: {
    key: () => [
      ['device', 'tagSuggestions'],
      { input: undefined, type: 'query' as const }
    ] as const,
  },

  /**
   * Active scans for a device (polling query)
   */
  activeScans: {
    key: (deviceId: string) => [
      ['device', 'activeScans'],
      { input: { deviceId }, type: 'query' as const }
    ] as const,
  },
};

/**
 * Device mutation hooks (tRPC pattern)
 */

export const useDeleteDeviceMutation = () => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  // Use tRPC-compatible key structure for optimistic updates
  // deviceQueries.list.base = ['device', 'list'] - matches all tRPC device list queries
  // This matches tRPC cache keys like [['device', 'list'], { input: {...}, type: 'query' }]
  const optimistic = createOptimisticDeleteHandlers([
    deviceQueries.list.base
  ]);

  return useMutationWithToast({
    mutationKey: ['device', 'delete'],
    mutationFn: (data: { deviceId: string }) =>
      trpcClient.device.remove.mutate(data),
    successMessage: 'Device deleted successfully',
    invalidateKeys: [deviceQueries.list.base],
    onMutate: (variables) => optimistic.onMutate(variables, queryClient),
    onError: (err, variables, context) => optimistic.onError(err, variables, context, queryClient),
    onSettled: () => optimistic.onSettled(queryClient),
  });
};

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
      deviceQueries.detail.key(deviceId),
      deviceQueries.tagSuggestions.key(),
    ],
  });
};

export const useVerifyDeviceMutation = () => {
  const trpcClient = useTRPCClient();

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
    invalidateKeys: [deviceQueries.list.base],
  });
};

export const useToggleDeviceVerificationMutation = () => {
  const trpcClient = useTRPCClient();

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
    successMessage: (_response, vars) =>
      vars.verify ? 'Device verified' : 'Device unverified',
    invalidateKeys: [deviceQueries.list.base],
  });
};

export const useStartDeviceScanMutation = (deviceId: string) => {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutationWithToast({
    mutationKey: ['device', 'scan', deviceId],
    mutationFn: (data: { deviceId: string; target: string; preset: 'QUICK' | 'STANDARD' | 'THOROUGH' }) =>
      trpcClient.device.startScan.mutate(data),
    successMessage: 'Scan started successfully',
    invalidateKeys: [deviceQueries.activeScans.key(deviceId)],
    toastOnSuccess: false,

    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: deviceQueries.activeScans.key(deviceId),
      });

      const previousScans = queryClient.getQueryData(
        deviceQueries.activeScans.key(deviceId),
      );

      queryClient.setQueryData(
        deviceQueries.activeScans.key(deviceId),
        (old: any[] = []) => [
          ...old,
          {
            id: `temp-${Date.now()}`,
            deviceId: variables.deviceId,
            target: variables.target,
            status: 'PENDING',
            startedAt: new Date().toISOString(),
          },
        ],
      );

      return { previousScans };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousScans) {
        queryClient.setQueryData(
          deviceQueries.activeScans.key(deviceId),
          context.previousScans,
        );
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceQueries.activeScans.key(deviceId) });
    },
  });
};

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
    invalidateKeys: [deviceQueries.list.base],
    onSuccess: async () => {
      // Invalidate onboarding status cache (updates asset counts)
      await queryClient.invalidateQueries({ queryKey: onboardingStatusQueryKey() });

      // Invalidate discovery devices cache using tRPC-compatible pattern
      // Use partial matching to invalidate all discoveryDevices queries
      await queryClient.invalidateQueries({
        queryKey: [['onboarding', 'discoveryDevices']],
      });
    },
  });
};
