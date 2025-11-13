/**
 * Notification API Serializers
 *
 * Transforms database notification records into consistent API payloads for cross-client
 * compatibility (web UI, CLI, external APIs).
 *
 * Pattern mirrors legacy `footprint_app/front_interface/common.convert_notifications`:
 * - Stable field names (id, refId, priority, message, module, type, timestamp)
 * - Type-safe transformations
 * - Consistent across all API endpoints
 *
 * Usage:
 * ```typescript
 * const notifications = await getNotifications({ organizationId });
 * const serialized = notifications.items.map(serializeNotification);
 * return Response.json({ notifications: serialized });
 * ```
 */

import type { notifications } from '../schema/notifications';

// Type alias to avoid circular reference in function signatures
type NotificationRecord = typeof notifications.$inferSelect;

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Serialized notification payload for API responses
 *
 * Mirrors legacy convert_notifications structure with modern TypeScript types
 */
export interface SerializedNotification {
  /** Notification ID */
  id: string;

  /** Reference ID (deviceId or scanRunId) for linking to related entities */
  refId: string | null;

  /** Numeric priority for sorting (1-100, higher = more urgent) */
  priority: number;

  /** Human-readable notification message */
  message: string;

  /** Notification title (primary text) */
  title: string;

  /** Module/category (e.g., "NETWORK_SECURITY", "VULNERABILITY_MANAGEMENT") */
  module: string;

  /** Notification type (e.g., "NEW_PORT", "NEW_CVE") */
  type: string;

  /** Severity level for visual styling */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

  /** ISO 8601 timestamp of notification creation */
  timestamp: string;

  /** ISO 8601 timestamp of last update */
  updatedAt: string;

  /** ISO 8601 timestamp when user marked as read (null if unread) */
  readAt: string | null;

  /** Additional structured data (ports, CVEs, etc.) */
  data: Record<string, any> | null;

  /** User ID if user-specific notification */
  userId: string | null;

  /** Device ID if device-specific notification */
  deviceId: string | null;

  /** Scan run ID if scan-related notification */
  scanRunId: string | null;

  /** Email delivery status */
  emailSent: boolean;

  /** ISO 8601 timestamp when email was sent (null if not sent) */
  emailSentAt: string | null;
}

/**
 * Paginated notification list response
 */
export interface SerializedNotificationList {
  notifications: SerializedNotification[];
  total: number;
  hasMore: boolean;
  unreadCount: number;
}

/**
 * Notification statistics for dashboard/badges
 */
export interface NotificationStats {
  total: number;
  unread: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  byType: {
    newPort: number;
    closedPort: number;
    newCVE: number;
    cveSeverityIncrease: number;
  };
}

// ============================================================================
// Priority Mapping
// ============================================================================

/**
 * Map severity to numeric priority (1-100 scale, higher = more urgent)
 *
 * Mirrors legacy priority scores for cross-system compatibility
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 100,
  HIGH: 75,
  MEDIUM: 50,
  LOW: 25,
  INFO: 10,
};

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Serialize a single notification for API response
 *
 * Transforms database record into consistent API payload format
 *
 * @param notification - Database notification record
 * @returns Serialized notification ready for JSON response
 */
export function serializeNotification(
  notification: NotificationRecord
): SerializedNotification {
  return {
    id: notification.id,
    refId: notification.deviceId || notification.scanRunId || null,
    priority: SEVERITY_PRIORITY[notification.severity] || 50,
    message: notification.message || '',
    title: notification.title,
    module: notification.module, // Use database field directly (set by catalog)
    type: notification.type,
    severity: notification.severity as SerializedNotification['severity'],
    timestamp: new Date(notification.createdAt).toISOString(),
    updatedAt: new Date(notification.updatedAt).toISOString(),
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    data: notification.data,
    userId: notification.userId,
    deviceId: notification.deviceId,
    scanRunId: notification.scanRunId,
    emailSent: notification.emailSent,
    emailSentAt: notification.emailSentAt
      ? new Date(notification.emailSentAt).toISOString()
      : null,
  };
}

/**
 * Serialize a list of notifications with pagination metadata
 *
 * @param notificationRecords - Array of database notification records
 * @param total - Total count of notifications (for pagination)
 * @param hasMore - Whether more notifications are available
 * @param unreadCount - Count of unread notifications
 * @returns Serialized notification list with metadata
 */
export function serializeNotificationList(
  notificationRecords: NotificationRecord[],
  total: number,
  hasMore: boolean,
  unreadCount: number
): SerializedNotificationList {
  return {
    notifications: notificationRecords.map(serializeNotification),
    total,
    hasMore,
    unreadCount,
  };
}

/**
 * Calculate notification statistics for dashboard/badges
 *
 * @param notificationRecords - Array of database notification records
 * @returns Aggregated statistics
 */
export function calculateNotificationStats(
  notificationRecords: NotificationRecord[]
): NotificationStats {
  const stats: NotificationStats = {
    total: notificationRecords.length,
    unread: 0,
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
    byType: {
      newPort: 0,
      closedPort: 0,
      newCVE: 0,
      cveSeverityIncrease: 0,
    },
  };

  for (const notification of notificationRecords) {
    // Count unread
    if (!notification.readAt) {
      stats.unread++;
    }

    // Count by severity
    const severityKey = notification.severity.toLowerCase() as keyof typeof stats.bySeverity;
    if (severityKey in stats.bySeverity) {
      stats.bySeverity[severityKey]++;
    }

    // Count by type
    switch (notification.type) {
      case 'NEW_PORT':
        stats.byType.newPort++;
        break;
      case 'CLOSED_PORT':
        stats.byType.closedPort++;
        break;
      case 'NEW_CVE':
        stats.byType.newCVE++;
        break;
      case 'CVE_SEVERITY_INCREASE':
        stats.byType.cveSeverityIncrease++;
        break;
    }
  }

  return stats;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sort notifications by priority (CRITICAL first) then timestamp (newest first)
 *
 * Use this to sort serialized notifications for display
 *
 * @param a - First notification
 * @param b - Second notification
 * @returns Sort comparison result
 */
export function sortByPriorityAndTime(
  a: SerializedNotification,
  b: SerializedNotification
): number {
  // First sort by priority (higher priority first)
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }

  // Then sort by timestamp (newer first)
  return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

/**
 * Filter notifications by read status
 *
 * @param notifications - Array of serialized notifications
 * @param unreadOnly - If true, return only unread notifications
 * @returns Filtered notifications
 */
export function filterByReadStatus(
  notifications: SerializedNotification[],
  unreadOnly: boolean
): SerializedNotification[] {
  if (!unreadOnly) return notifications;
  return notifications.filter((n) => n.readAt === null);
}

/**
 * Filter notifications by severity threshold
 *
 * @param notifications - Array of serialized notifications
 * @param minSeverity - Minimum severity to include (e.g., 'HIGH' includes HIGH and CRITICAL)
 * @returns Filtered notifications
 */
export function filterBySeverity(
  notifications: SerializedNotification[],
  minSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
): SerializedNotification[] {
  const minPriority = SEVERITY_PRIORITY[minSeverity];
  return notifications.filter((n) => n.priority >= minPriority);
}
