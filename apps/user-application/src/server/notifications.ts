import { createServerFn } from '@tanstack/react-start';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCountWithSeverity,
  type GetNotificationsInput,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import { z } from 'zod';
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth';
import type {
  NotificationsListResult,
  NotificationMutationResult,
  MarkAllNotificationsResult,
  UnreadCountResult,
} from './notifications/types';
import { normalizeNotificationList, normalizeNotification } from '@/features/notifications/utils';

const logger = createLogger({ name: 'notifications-server' });

// ============================================================================
// Input Validation Schemas
// ============================================================================

const GetNotificationsSchema = z.object({
  unreadOnly: z.boolean().optional().default(false),
  deviceId: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
});

const MarkAsReadSchema = z.object({
  notificationId: z.string().min(1, 'Notification ID is required'),
});

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get notifications for current user/organization
 *
 * Usage in component:
 * ```typescript
 * const { data } = useQuery({
 *   queryKey: ['notifications', { unreadOnly: true }],
 *   queryFn: () => getNotificationsData({ data: { unreadOnly: true } }),
 * });
 * ```
 */
export const getNotificationsData = createServerFn({
  method: 'POST',
})
  .inputValidator(GetNotificationsSchema.parse)
  .handler(async ({ data }): Promise<NotificationsListResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Fetching notifications', {
        organizationId,
        userId: user.id,
        unreadOnly: data.unreadOnly,
        deviceId: data.deviceId,
        limit: data.limit,
        offset: data.offset,
      });

      const params: GetNotificationsInput = {
        organizationId,
        userId: user.id,
        deviceId: data.deviceId ?? null,
        unreadOnly: data.unreadOnly,
        limit: data.limit,
        offset: data.offset,
      };

      const result = await getNotifications(params);

      logger.info('Successfully fetched notifications', {
        organizationId,
        userId: user.id,
        total: result.total,
        returned: result.items.length,
        hasMore: result.hasMore,
      });

      // Use normalizer to convert DB records → client-safe ISO strings
      // Also filters out invalid types (security guard)
      const normalized = normalizeNotificationList(result.items);

      return {
        success: true,
        items: normalized,
        total: result.total,
        hasMore: result.hasMore,
      };
    } catch (error) {
      logger.error('Failed to fetch notifications', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });

      return {
        success: false,
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  });

/**
 * Mark a single notification as read
 *
 * Usage in component:
 * ```typescript
 * const mutation = useMutation({
 *   mutationFn: (notificationId: string) =>
 *     markNotificationAsReadData({ data: { notificationId } }),
 *   onSuccess: () => queryClient.invalidateQueries(['notifications']),
 * });
 * ```
 */
export const markNotificationAsReadData = createServerFn({
  method: 'POST',
})
  .inputValidator(MarkAsReadSchema.parse)
  .handler(async ({ data }): Promise<NotificationMutationResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Marking notification as read', {
        notificationId: data.notificationId,
        organizationId,
        userId: user.id,
      });

      const notification = await markNotificationAsRead({
        notificationId: data.notificationId,
        organizationId,
      });

      if (!notification) {
        logger.warn('Notification not found when marking as read', {
          notificationId: data.notificationId,
          organizationId,
        });
        return {
          success: false,
          error: 'Notification not found or access denied',
        };
      }

      logger.info('Successfully marked notification as read', {
        notificationId: notification.id,
        organizationId,
      });

      // Use normalizer for consistent Date → ISO conversion
      const normalized = normalizeNotification(notification);

      if (!normalized) {
        return {
          success: false,
          error: 'Invalid notification type',
        };
      }

      return {
        success: true,
        notification: normalized,
      };
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        notificationId: data.notificationId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark notification as read',
      };
    }
  });

/**
 * Mark all notifications as read for entire organization
 *
 * IMPORTANT: This marks ALL org notifications as read, not just the current user's.
 * Design Decision: Security notifications are org-wide events (port openings, CVEs)
 * that affect the entire organization. When one admin marks notifications as read,
 * it signals the team has reviewed the security event.
 *
 * Alternative: If you want user-scoped read status, add a separate "user_read_status"
 * junction table to track per-user read state while keeping org-wide notifications.
 *
 * Usage in component:
 * ```typescript
 * const mutation = useMutation({
 *   mutationFn: () => markAllNotificationsAsReadData(),
 *   onSuccess: () => queryClient.invalidateQueries(['notifications']),
 * });
 * ```
 */
export const markAllNotificationsAsReadData = createServerFn({
  method: 'POST',
})
  .inputValidator(() => ({}))
  .handler(async (): Promise<MarkAllNotificationsResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      logger.info('Marking all org notifications as read (org-wide action)', {
        organizationId,
        userId: user.id,
        note: 'This marks ALL org notifications, not just current user',
      });

      const count = await markAllNotificationsAsRead(organizationId);

      logger.info('Successfully marked all notifications as read', {
        organizationId,
        count,
      });

      return {
        success: true,
        count,
      };
    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark all notifications as read',
      };
    }
  });

/**
 * Get unread notification count with severity breakdown
 *
 * Returns total count plus counts per severity for indicator color logic.
 *
 * Usage in component:
 * ```typescript
 * const { data } = useQuery({
 *   queryKey: ['notifications', 'unreadCount'],
 *   queryFn: () => getUnreadNotificationCountData(),
 *   refetchInterval: 30000, // Poll every 30 seconds
 * });
 * // data = { count: 8, criticalCount: 0, highCount: 1, mediumCount: 1, lowCount: 5, infoCount: 1 }
 * ```
 */
export const getUnreadNotificationCountData = createServerFn({
  method: 'GET',
})
  .inputValidator(() => ({}))
  .handler(async (): Promise<UnreadCountResult> => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      const result = await getUnreadNotificationCountWithSeverity({
        organizationId,
        userId: user.id,
      });

      // Don't log every count fetch (too noisy for polling)
      // Only log errors or unusual cases

      return {
        success: true,
        count: result.total,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        mediumCount: result.mediumCount,
        lowCount: result.lowCount,
        infoCount: result.infoCount,
      };
    } catch (error) {
      logger.error('Failed to fetch unread notification count', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
      });

      return {
        success: false,
        count: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        infoCount: 0,
      };
    }
  });
