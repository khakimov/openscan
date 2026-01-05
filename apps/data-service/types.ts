/**
 * Shared types for data-service worker
 */

export type NotificationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * Individual notification within a batch
 */
export interface NotificationBatchItem {
  notificationId: string;
  deviceId?: string;
  severity: NotificationSeverity;
  eventType: string;
  title: string;
  message?: string;
  payload: Record<string, unknown>;
}

/**
 * Notification delivery message (consumed from queue)
 */
export interface NotificationDeliveryMessage {
  notificationId: string;
  organizationId: string;
  deviceId?: string;
  severity: NotificationSeverity;
  targetChannels: ('email' | 'telegram')[];
  recipients: string[];
  eventType: string;
  payload: Record<string, unknown>;
  notificationTitle: string;
  notificationMessage?: string;
  // Batch fields
  scanRunId?: string;
  isBatch?: boolean;
  batchItems?: NotificationBatchItem[];
}
