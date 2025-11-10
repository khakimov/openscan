import { createServerFn } from '@tanstack/react-start';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  type GetNotificationsInput,
} from '@repo/data-ops';
import { createLogger } from '@repo/logger';
import { z } from 'zod';
import { getCurrentOrganizationId, getCurrentUser } from './utils/auth';

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
  .handler(async ({ data }) => {
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

      return {
        success: true,
        items: result.items,
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
  .handler(async ({ data }) => {
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
        throw new Error('Notification not found or access denied');
      }

      logger.info('Successfully marked notification as read', {
        notificationId: notification.id,
        organizationId,
      });

      return {
        success: true,
        notification,
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

      throw error;
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
  .handler(async () => {
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

      throw error;
    }
  });

/**
 * Get unread notification count for badge display
 *
 * Usage in component:
 * ```typescript
 * const { data } = useQuery({
 *   queryKey: ['notifications', 'unreadCount'],
 *   queryFn: () => getUnreadNotificationCountData(),
 *   refetchInterval: 30000, // Poll every 30 seconds
 * });
 * ```
 */
export const getUnreadNotificationCountData = createServerFn({
  method: 'GET',
})
  .inputValidator(() => ({}))
  .handler(async () => {
    try {
      const organizationId = await getCurrentOrganizationId();
      const user = await getCurrentUser();

      const count = await getUnreadNotificationCount({
        organizationId,
        userId: user.id,
      });

      // Don't log every count fetch (too noisy for polling)
      // Only log errors or unusual cases

      return {
        success: true,
        count,
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
      };
    }
  });
