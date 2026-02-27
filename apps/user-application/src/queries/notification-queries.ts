import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';
import { useTRPC, useTRPCClient } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Notification Query Key Factory (OpenPanel tRPC pattern)
 *
 * Benefits:
 * - Single source of truth for notification query keys
 * - Mutations can invalidate using these keys
 * - Consistent refetch intervals for unread count
 * - Type-safe across components
 *
 * Usage in components (OpenPanel pattern):
 * const trpc = useTRPC();
 * const trpcClient = useTRPCClient();
 * const { data } = useQuery({
 *   ...trpc.notification.list.queryOptions({ unreadOnly: false }),
 *   queryFn: () => trpcClient.notification.list.query({ unreadOnly: false }),
 * });
 *
 * Or use Suspense pattern:
 * const { data } = useSuspenseQuery({
 *   ...trpc.notification.preferences.queryOptions(),
 *   queryFn: () => trpcClient.notification.preferences.query(),
 * });
 */

// ========================================
// Query Key Factory
// ========================================

export const notificationQueries = {
  /**
   * Notification list query keys (tRPC-compatible)
   */
  list: {
    // Base key for invalidating all notification list queries
    // Matches the tRPC procedure path
    all: [['notification', 'list']] as const,

    // Specific key for a query with params
    // Matches: context.trpc.notification.list.queryOptions({ ...params }).queryKey
    key: (params?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
      deviceId?: string;
      module?: string;
    }) => [
      ['notification', 'list'],
      {
        input: params || {},
        type: 'query' as const,
      },
    ] as const,
  },

  /**
   * Unread count query key (tRPC-compatible)
   * Matches: context.trpc.notification.unreadCount.queryOptions().queryKey
   */
  unreadCount: {
    // Base key for invalidating all unread count queries
    base: ['notification', 'unreadCount'] as const,
    // Full tRPC tuple key
    key: () => [['notification', 'unreadCount'], { input: undefined, type: 'query' as const }] as const,
  },

  /**
   * Notification preferences query key (tRPC-compatible)
   * Matches: context.trpc.notification.preferences.queryOptions().queryKey
   */
  preferences: {
    // Base key for invalidating all preferences queries
    base: ['notification', 'preferences'] as const,

    // Full tRPC tuple key
    key: () => [['notification', 'preferences'], { input: undefined, type: 'query' as const }] as const,
  },
};

// ========================================
// Query Hooks (tRPC pattern)
// ========================================

/**
 * Get notifications for a specific device
 * Used in Activity tab to show device changelog
 */
export const useDeviceNotifications = (deviceId: string) => {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  return useQuery({
    ...trpc.notification.list.queryOptions({ deviceId }),
    queryFn: () => trpcClient.notification.list.query({ deviceId }),
  });
};

// ========================================
// Mutation Hooks (tRPC pattern)
// ========================================

/**
 * Mark single notification as read
 */
export const useMarkNotificationAsReadMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['notification', 'markAsRead'],
    mutationFn: (notificationId: string) =>
      trpcClient.notification.markAsRead.mutate({ notificationId }),
    successMessage: 'Notification marked as read',
    invalidateKeys: [
      notificationQueries.list.all,
      notificationQueries.unreadCount.base,
    ],
    toastOnSuccess: false, // Silent for better UX
  });
};

/**
 * Mark all notifications as read
 */
export const useMarkAllNotificationsAsReadMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['notification', 'markAllAsRead'],
    mutationFn: () => trpcClient.notification.markAllAsRead.mutate(),
    successMessage: 'All notifications marked as read',
    invalidateKeys: [
      notificationQueries.list.all,
      notificationQueries.unreadCount.base,
    ],
  });
};

// ========================================
// Mutation Hooks
// ========================================

/**
 * Save notification preferences mutation
 * OpenPanel pattern: Invalidates using base key for consistent cache management
 */
export const useSaveNotificationPreferencesMutation = () => {
  const trpcClient = useTRPCClient();

  return useMutationWithToast({
    mutationKey: ['notifications', 'preferences', 'save'],
    mutationFn: (data: {
      vulnerabilityAlertsEnabled: boolean;
      alertSeverities: string[];
      weeklySummaryEnabled: boolean;
    }) => trpcClient.notification.savePreferences.mutate(data),
    successMessage: 'Notification preferences saved',
    invalidateKeys: [notificationQueries.preferences.base],
  });
};
