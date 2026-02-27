import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, createTRPCRouter } from '../trpc';
import type { TrpcContext } from '../trpc';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCountWithSeverity,
  type GetNotificationsInput,
} from '@repo/data-ops';
import {
  updateEmailSeveritiesOrDisable,
  resolveEmailSeverities,
  type NotificationSeverity,
} from '@repo/data-ops/queries/notifications/settings';
import { normalizeNotificationList, normalizeNotification } from '@/features/notifications/utils';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'notification-trpc' });

/**
 * Helper to require organizationId from protected context
 * Throws PRECONDITION_FAILED if user has no organizations
 *
 * Context already performs fallback to first org during onboarding,
 * so this only fails when user truly has no organizations.
 */
function requireOrganizationId(ctx: { user: NonNullable<TrpcContext['user']> }): string {
  const organizationId = ctx.user.organizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'User has no organizations. Please create an organization first.',
    });
  }
  return organizationId;
}

/**
 * Notification router - OpenPanel pattern
 * All notification queries go through tRPC to avoid authentication context issues
 */
export const notificationRouter = createTRPCRouter({
  /**
   * Get notifications list with optional filters
   */
  list: protectedProcedure
    .input(z.object({
      unreadOnly: z.boolean().optional().default(false),
      deviceId: z.string().optional(),
      module: z.enum(['NETWORK_SECURITY', 'VULNERABILITY_MANAGEMENT', 'DEVICE_LIFECYCLE', 'CONFIGURATION']).optional(),
      limit: z.number().int().positive().max(100).optional().default(50),
      offset: z.number().int().nonnegative().optional().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Fetching notifications via tRPC', {
        organizationId,
        userId: user.id,
        unreadOnly: input.unreadOnly,
        deviceId: input.deviceId,
        module: input.module,
        limit: input.limit,
        offset: input.offset,
      });

      const params: GetNotificationsInput = {
        organizationId,
        userId: user.id,
        deviceId: input.deviceId ?? null,
        module: input.module ?? null,
        unreadOnly: input.unreadOnly,
        limit: input.limit,
        offset: input.offset,
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
        items: normalized,
        total: result.total,
        hasMore: result.hasMore,
      };
    }),

  /**
   * Get unread notification count with severity breakdown
   * Used for polling the notification badge
   */
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      const result = await getUnreadNotificationCountWithSeverity({
        organizationId,
        userId: user.id,
      });

      // Don't log every count fetch (too noisy for polling)
      return {
        count: result.total,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        mediumCount: result.mediumCount,
        lowCount: result.lowCount,
        infoCount: result.infoCount,
      };
    }),

  /**
   * Mark a single notification as read
   */
  markAsRead: protectedProcedure
    .input(z.object({
      notificationId: z.string().min(1, 'Notification ID is required'),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Marking notification as read via tRPC', {
        notificationId: input.notificationId,
        organizationId,
        userId: user.id,
      });

      const notification = await markNotificationAsRead({
        notificationId: input.notificationId,
        organizationId,
      });

      if (!notification) {
        logger.warn('Notification not found when marking as read', {
          notificationId: input.notificationId,
          organizationId,
        });
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Notification not found or access denied',
        });
      }

      logger.info('Successfully marked notification as read', {
        notificationId: notification.id,
        organizationId,
      });

      // Use normalizer for consistent Date → ISO conversion
      const normalized = normalizeNotification(notification);

      if (!normalized) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid notification type',
        });
      }

      return {
        notification: normalized,
      };
    }),

  /**
   * Mark all notifications as read for entire organization
   *
   * IMPORTANT: This marks ALL org notifications as read, not just the current user's.
   * Design Decision: Security notifications are org-wide events (port openings, CVEs)
   * that affect the entire organization. When one admin marks notifications as read,
   * it signals the team has reviewed the security event.
   */
  markAllAsRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

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
        count,
      };
    }),

  /**
   * Get notification preferences for current organization
   *
   * Returns current email severity threshold settings from database.
   * Empty array contract: alerts disabled (vulnerabilityAlertsEnabled = false)
   */
  preferences: protectedProcedure
    .query(async ({ ctx }) => {
      const organizationId = requireOrganizationId(ctx);

      const alertSeverities = await resolveEmailSeverities(organizationId);

      return {
        // Empty array = alerts disabled
        vulnerabilityAlertsEnabled: alertSeverities.length > 0,
        alertSeverities,
        weeklySummaryEnabled: true,
      };
    }),

  /**
   * Save notification preferences for current organization
   *
   * Stores email severity threshold settings in organization_notification_settings table.
   * - If vulnerabilityAlertsEnabled is false, stores empty array (disables all alerts)
   * - If enabled, stores the selected severities
   * Note: weeklySummaryEnabled is logged but not yet persisted.
   */
  savePreferences: protectedProcedure
    .input(z.object({
      vulnerabilityAlertsEnabled: z.boolean(),
      alertSeverities: z.array(z.string()),
      weeklySummaryEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = requireOrganizationId(ctx);
      const user = ctx.user;

      logger.info('Saving notification preferences', {
        userId: user.id,
        organizationId,
        preferences: input,
      });

      // Save email severity thresholds or disable alerts
      // Empty array contract: alerts disabled, email worker skips delivery
      await updateEmailSeveritiesOrDisable({
        organizationId,
        emailAllowedSeverities: input.vulnerabilityAlertsEnabled
          ? (input.alertSeverities as NotificationSeverity[])
          : [], // Empty array = disabled
      });

      logger.info('Notification preferences saved successfully', {
        userId: user.id,
        organizationId,
      });

      return {
        success: true,
        message: 'Notification preferences saved',
      };
    }),
});
