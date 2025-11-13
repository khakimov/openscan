import { queryOptions } from '@tanstack/react-query';
import {
  getNotificationsData,
  getUnreadNotificationCountData,
  markNotificationAsReadData,
  markAllNotificationsAsReadData,
} from '@/server/notifications';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '@/server/preferences';
import { useMutationWithToast } from '@/hooks/use-mutation-with-toast';

/**
 * Notification Query Helpers (OpenPanel pattern)
 *
 * Pattern from: https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/queries/notifications.ts
 *
 * Benefits:
 * - Single source of truth for notification query keys
 * - Mutations can invalidate using these keys
 * - Consistent refetch intervals for unread count
 * - Type-safe across components
 *
 * Usage in components:
 * const { data } = useQuery(notificationListQuery({ unreadOnly: false }));
 * const { data: count } = useQuery(unreadNotificationCountQuery);
 */

// ========================================
// Query Helpers
// ========================================

/**
 * Get paginated notification list
 * Used in notification bell dropdown and notifications page
 */
export const notificationListQuery = (params: {
  unreadOnly?: boolean;
  limit?: number;
  page?: number;
}) =>
  queryOptions({
    queryKey: ['notifications', 'list', params],
    queryFn: () => getNotificationsData({ data: params }),
    staleTime: 30_000, // 30 seconds
  });

/**
 * Get unread notification count (badge)
 * Refetches every 30 seconds to keep count fresh
 */
export const unreadNotificationCountQuery = queryOptions({
  queryKey: ['notifications', 'unreadCount'],
  queryFn: () => getUnreadNotificationCountData(),
  staleTime: 30_000, // 30 seconds
  refetchInterval: 30_000, // Auto-refetch every 30 seconds
  refetchIntervalInBackground: true, // Keep polling when tab is inactive
});

/**
 * Get notification preferences (settings)
 * Used in onboarding and account settings
 */
export const notificationPreferencesQuery = queryOptions({
  queryKey: ['notifications', 'preferences'],
  queryFn: async () => {
    const response = await getNotificationPreferences();
    if (!response.success) {
      throw new Error(response.error ?? 'Failed to get notification preferences');
    }
    return response.data;
  },
  staleTime: 5 * 60_000, // 5 minutes (preferences don't change often)
});

// ========================================
// Mutation Helpers (non-hook exports)
// ========================================

/**
 * Mark single notification as read
 * Export for use in useMutationWithToast
 */
export const markNotificationAsRead = async (notificationId: string) => {
  const response = await markNotificationAsReadData({ data: { notificationId } });
  if (!response.success) {
    throw new Error(response.error ?? 'Failed to mark notification as read');
  }
  return response;
};

/**
 * Mark all notifications as read
 * Export for use in useMutationWithToast
 */
export const markAllNotificationsAsRead = async () => {
  const response = await markAllNotificationsAsReadData();
  if (!response.success) {
    throw new Error(response.error ?? 'Failed to mark all notifications as read');
  }
  return response;
};

// ========================================
// Mutation Hooks
// ========================================

/**
 * Save notification preferences mutation
 * Used in onboarding and settings
 */
export const useSaveNotificationPreferencesMutation = () =>
  useMutationWithToast({
    mutationKey: ['notifications', 'preferences', 'save'],
    mutationFn: async (data: {
      vulnerabilityAlertsEnabled: boolean;
      alertSeverities: string[];
      weeklySummaryEnabled: boolean;
    }) => {
      const response = await saveNotificationPreferences({ data });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to save notification preferences');
      }
      return response;
    },
    successMessage: 'Notification preferences saved',
    invalidateKeys: [notificationPreferencesQuery.queryKey],
  });
