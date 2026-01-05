/**
 * Type definitions for notification server functions
 */

export type NotificationSeverity =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO';

export type NotificationType =
  | 'NEW_PORT'
  | 'CLOSED_PORT'
  | 'NEW_CVE'
  | 'CVE_SEVERITY_INCREASE'
  | 'CVE_FIXED'
  | 'CVE_REGRESSED'
  | 'SERVICE_DRIFT'
  | 'SERVER_PROMOTED';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  severity: NotificationSeverity;
  data: Record<string, unknown> | null;
  isRead?: boolean;
  readAt?: string | null; // ISO string after JSON serialization
  createdAt: string; // ISO string after JSON serialization
  deviceId?: string | null;
  deviceName?: string | null;
  scanRunId?: string | null;
  // NOTE: Database may include additional fields. Index signature uses `any` for TanStack compatibility,
  // but handlers should treat unknown fields as type `unknown` for safety.
  [key: string]: any;
}

// Get notifications result types
export interface NotificationsListSuccess {
  success: true;
  items: NotificationItem[];
  total: number;
  hasMore: boolean;
}

export interface NotificationsListError {
  success: false;
  items: never[];
  total: 0;
  hasMore: false;
}

export type NotificationsListResult =
  | NotificationsListSuccess
  | NotificationsListError;

// Mark notification as read result types
export interface NotificationMutationSuccess {
  success: true;
  notification: NotificationItem;
  error?: undefined;
}

export interface NotificationMutationError {
  success: false;
  notification?: undefined;
  error: string;
}

export type NotificationMutationResult =
  | NotificationMutationSuccess
  | NotificationMutationError;

// Mark all notifications as read result types
export interface MarkAllNotificationsSuccess {
  success: true;
  count: number;
  error?: undefined;
}

export interface MarkAllNotificationsError {
  success: false;
  count?: undefined;
  error: string;
}

export type MarkAllNotificationsResult =
  | MarkAllNotificationsSuccess
  | MarkAllNotificationsError;

// Unread count result types
export interface UnreadCountSuccess {
  success: true;
  count: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
}

export interface UnreadCountError {
  success: false;
  count: 0;
  criticalCount: 0;
  highCount: 0;
  mediumCount: 0;
  lowCount: 0;
  infoCount: 0;
}

export type UnreadCountResult =
  | UnreadCountSuccess
  | UnreadCountError;
