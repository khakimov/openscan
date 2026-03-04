/**
 * Notification Schemas and Types
 *
 * Shared notification contracts across UI, workers, and data-ops.
 * Single source of truth for notification types and modules.
 */

import { z } from 'zod';

/**
 * Notification Module - High-level categorization
 */
export const notificationModuleEnum = z.enum([
  'NETWORK_SECURITY',
  'VULNERABILITY_MANAGEMENT',
  'DEVICE_LIFECYCLE',
  'CONFIGURATION',
]);

export type NotificationModule = z.infer<typeof notificationModuleEnum>;

/**
 * Notification Type - Specific event types
 */
export const notificationTypeEnum = z.enum([
  // Network Security
  'NEW_PORT',
  'CLOSED_PORT',
  'SERVICE_UP',
  'SERVICE_DOWN',
  'SERVICE_DRIFT',

  // Vulnerability Management
  'NEW_CVE',
  'CVE_SEVERITY_INCREASE',
  'CVE_FIXED',
  'CVE_REGRESSED',

  // Device Lifecycle
  'SERVER_PROMOTED',

  // Configuration Drift
  'SERVER_IP_CHANGED',
  'APP_PRODUCT_CHANGED',
  'APP_VERSION_CHANGED',
  'WEB_TITLE_CHANGED',
  'MANUAL_EDIT',
]);

export type NotificationType = z.infer<typeof notificationTypeEnum>;

/**
 * Notification Severity - Impact level
 */
export const notificationSeverityEnum = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
]);

export type NotificationSeverity = z.infer<typeof notificationSeverityEnum>;

/**
 * Module-to-Type Mapping (for validation)
 * Ensures type belongs to correct module
 */
export const MODULE_TYPE_MAP: Record<NotificationModule, Set<NotificationType>> = {
  NETWORK_SECURITY: new Set([
    'NEW_PORT',
    'CLOSED_PORT',
    'SERVICE_UP',
    'SERVICE_DOWN',
    'SERVICE_DRIFT',
  ]),
  VULNERABILITY_MANAGEMENT: new Set([
    'NEW_CVE',
    'CVE_SEVERITY_INCREASE',
    'CVE_FIXED',
    'CVE_REGRESSED',
  ]),
  DEVICE_LIFECYCLE: new Set([
    'SERVER_PROMOTED',
  ]),
  CONFIGURATION: new Set([
    'SERVER_IP_CHANGED',
    'APP_PRODUCT_CHANGED',
    'APP_VERSION_CHANGED',
    'WEB_TITLE_CHANGED',
    'MANUAL_EDIT',
  ]),
};

/**
 * Validate that notification type matches module
 */
export function validateNotificationTypeModule(
  type: NotificationType,
  module: NotificationModule
): boolean {
  return MODULE_TYPE_MAP[module]?.has(type) ?? false;
}

// ============================================================================
// Notification Delivery Types (shared between web and data-service)
// ============================================================================

/**
 * Individual notification within a batch (for email delivery)
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
 * Notification delivery message (consumed from queue by data-service)
 * 
 * This is the unified type used across:
 * - apps/web/src/server/notifications/delivery-queue.ts (producer)
 * - apps/data-service/types.ts (consumer)
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
