/**
 * Configuration Drift Notification Helpers
 *
 * Provides high-level functions for logging configuration drift events without
 * requiring callers to construct notification objects manually.
 *
 * Usage:
 * - Discovery ingestion: Call logServerIPChanged() when IP changes
 * - Agent/scan processors: Call logAppProductChanged() or logAppVersionChanged()
 * - Console edits: Call logManualEdit() after updates
 *
 * Benefits:
 * - Consistent fingerprinting (prevents duplicates)
 * - Automatic severity mapping
 * - Centralized message formatting
 */

import { createId } from '@paralleldrive/cuid2';
import {
  createServerIPChangedNotification,
  createAppProductChangedNotification,
  createAppVersionChangedNotification,
  createWebTitleChangedNotification,
  createManualEditNotification,
  type NotificationType,
  type NotificationSeverity,
  type NotificationModule,
} from '../../notifications/catalog';
import { createNotification, upsertNotification, SUPPRESS_WINDOWS, type UpsertNotificationResult } from './crud';
import type { CreateNotificationInput } from './schemas';

/**
 * Configuration drift event types
 */
export type ConfigurationDriftType =
  | 'SERVER_IP_CHANGED'
  | 'APP_PRODUCT_CHANGED'
  | 'APP_VERSION_CHANGED'
  | 'WEB_TITLE_CHANGED'
  | 'MANUAL_EDIT';

/**
 * Payload for configuration drift notifications
 */
export interface ConfigurationDriftPayload {
  type: ConfigurationDriftType;
  organizationId: string;
  deviceId?: string;
  deviceName: string;

  // IP change params
  oldIp?: string;
  newIp?: string;

  // App change params
  port?: number;
  product?: string;
  oldProduct?: string;
  newProduct?: string;
  oldVersion?: string;
  newVersion?: string;

  // Web title change params
  oldTitle?: string;
  newTitle?: string;

  // Manual edit params
  editedBy?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
}

/**
 * Generate fingerprint for configuration drift notifications
 *
 * Fingerprint format ensures deduplication while allowing re-notification after suppress window:
 * - SERVER_IP_CHANGED: `server_ip:{deviceId}:{oldIp}:{newIp}`
 * - APP_PRODUCT_CHANGED: `app_product:{deviceId}:{port}:{oldProduct}:{newProduct}`
 * - APP_VERSION_CHANGED: `app_version:{deviceId}:{port}:{product}:{oldVersion}:{newVersion}`
 * - WEB_TITLE_CHANGED: `web_title:{deviceId}:{port}:{oldTitle}:{newTitle}`
 * - MANUAL_EDIT: `manual_edit:{deviceId}:{fieldChanged}:{timestamp}` (always unique for audit trail)
 */
function generateConfigDriftFingerprint(payload: ConfigurationDriftPayload): string {
  const { type, deviceId, port, oldIp, newIp, oldProduct, newProduct, product, oldVersion, newVersion, oldTitle, newTitle, fieldChanged } = payload;

  switch (type) {
    case 'SERVER_IP_CHANGED':
      return `server_ip:${deviceId}:${oldIp}:${newIp}`;

    case 'APP_PRODUCT_CHANGED':
      return `app_product:${deviceId}:${port}:${oldProduct}:${newProduct}`;

    case 'APP_VERSION_CHANGED':
      return `app_version:${deviceId}:${port}:${product}:${oldVersion}:${newVersion}`;

    case 'WEB_TITLE_CHANGED':
      return `web_title:${deviceId}:${port}:${oldTitle}:${newTitle}`;

    case 'MANUAL_EDIT':
      // Manual edits should always create new notifications for audit trail
      return `manual_edit:${deviceId}:${fieldChanged}:${Date.now()}`;

    default:
      return `config_drift:${deviceId}:${Date.now()}`;
  }
}

/**
 * Calculate suppress window for configuration drift notifications
 *
 * Uses shared SUPPRESS_WINDOWS from crud.ts for consistency.
 * 
 * Suppress windows prevent notification spam for repeated changes:
 * - SERVER_IP_CHANGED: 24 hours (IPs don't change frequently)
 * - APP_PRODUCT_CHANGED: 12 hours (suspicious changes should be investigated)
 * - APP_VERSION_CHANGED: 6 hours (version changes can happen during deployments)
 * - WEB_TITLE_CHANGED: 6 hours (content updates can be frequent)
 * - MANUAL_EDIT: 0 minutes (always create for audit trail)
 */
function getConfigDriftSuppressWindow(type: ConfigurationDriftType): Date {
  // Use UTC to ensure consistency regardless of server timezone
  const duration = SUPPRESS_WINDOWS[type as keyof typeof SUPPRESS_WINDOWS] ?? 6 * 60 * 60 * 1000;
  return new Date(Date.now() + duration);
}

/**
 * Log configuration drift notification
 *
 * High-level function that wraps notification creation with automatic:
 * - Message generation via catalog builders
 * - Fingerprint generation for deduplication
 * - Suppress window calculation
 *
 * @param payload Configuration drift event details
 * @returns Created notification or null if suppressed
 *
 * @example
 * ```typescript
 * // Discovery detects IP change
 * await logConfigurationDrift({
 *   type: 'SERVER_IP_CHANGED',
 *   organizationId: 'org_123',
 *   deviceId: 'dev_abc',
 *   deviceName: 'web-server-01',
 *   oldIp: '192.168.1.10',
 *   newIp: '192.168.1.20',
 * });
 *
 * // Scan processor detects product change
 * await logConfigurationDrift({
 *   type: 'APP_PRODUCT_CHANGED',
 *   organizationId: 'org_123',
 *   deviceId: 'dev_abc',
 *   deviceName: 'web-server-01',
 *   port: 80,
 *   oldProduct: 'Apache',
 *   newProduct: 'nginx',
 * });
 * ```
 */
export async function logConfigurationDrift(
  payload: ConfigurationDriftPayload
): Promise<UpsertNotificationResult['notification'] | null> {
  // Generate notification descriptor using catalog builders
  let descriptor;

  switch (payload.type) {
    case 'SERVER_IP_CHANGED':
      if (!payload.oldIp || !payload.newIp) {
        throw new Error('SERVER_IP_CHANGED requires oldIp and newIp');
      }
      descriptor = createServerIPChangedNotification({
        deviceName: payload.deviceName,
        oldIp: payload.oldIp,
        newIp: payload.newIp,
      });
      break;

    case 'APP_PRODUCT_CHANGED':
      if (!payload.port || !payload.oldProduct || !payload.newProduct) {
        throw new Error('APP_PRODUCT_CHANGED requires port, oldProduct, and newProduct');
      }
      descriptor = createAppProductChangedNotification({
        deviceName: payload.deviceName,
        port: payload.port,
        oldProduct: payload.oldProduct,
        newProduct: payload.newProduct,
      });
      break;

    case 'APP_VERSION_CHANGED':
      if (!payload.port || !payload.product || !payload.oldVersion || !payload.newVersion) {
        throw new Error('APP_VERSION_CHANGED requires port, product, oldVersion, and newVersion');
      }
      descriptor = createAppVersionChangedNotification({
        deviceName: payload.deviceName,
        port: payload.port,
        product: payload.product,
        oldVersion: payload.oldVersion,
        newVersion: payload.newVersion,
      });
      break;

    case 'WEB_TITLE_CHANGED':
      if (!payload.port || !payload.oldTitle || !payload.newTitle) {
        throw new Error('WEB_TITLE_CHANGED requires port, oldTitle, and newTitle');
      }
      descriptor = createWebTitleChangedNotification({
        deviceName: payload.deviceName,
        port: payload.port,
        oldTitle: payload.oldTitle,
        newTitle: payload.newTitle,
      });
      break;

    case 'MANUAL_EDIT':
      if (!payload.fieldChanged || !payload.oldValue || !payload.newValue) {
        throw new Error('MANUAL_EDIT requires fieldChanged, oldValue, and newValue');
      }
      descriptor = createManualEditNotification({
        deviceName: payload.deviceName,
        editedBy: payload.editedBy,
        fieldChanged: payload.fieldChanged,
        oldValue: payload.oldValue,
        newValue: payload.newValue,
      });
      break;

    default:
      throw new Error(`Unknown configuration drift type: ${payload.type}`);
  }

  // Build notification input
  const fingerprint = generateConfigDriftFingerprint(payload);
  const suppressUntil = getConfigDriftSuppressWindow(payload.type);

  const input: CreateNotificationInput = {
    organizationId: payload.organizationId,
    deviceId: payload.deviceId ?? null,
    type: descriptor.type as NotificationType,
    severity: descriptor.severity as NotificationSeverity,
    module: descriptor.module as NotificationModule,
    title: descriptor.title,
    message: descriptor.message,
    fingerprint,
    suppressUntil,
    data: {
      driftType: payload.type,
      ...payload,
    },
  };

  // Create notification with deduplication
  // MANUAL_EDIT uses unique fingerprints (audit trail) so createNotification is fine
  // All other types use upsertNotification for suppress window deduplication
  try {
    if (payload.type === 'MANUAL_EDIT') {
      return await createNotification(input);
    }
    const result = await upsertNotification(input);
    return result?.notification ?? null;
  } catch (error) {
    // Log error but don't throw (configuration drift notifications are non-critical)
    console.error('Failed to create configuration drift notification', {
      type: payload.type,
      deviceId: payload.deviceId,
      error,
    });
    return null;
  }
}

/**
 * Convenience helper: Log server IP change
 */
export async function logServerIPChanged(params: {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  oldIp: string;
  newIp: string;
}) {
  return logConfigurationDrift({
    type: 'SERVER_IP_CHANGED',
    ...params,
  });
}

/**
 * Convenience helper: Log app product change
 */
export async function logAppProductChanged(params: {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  port: number;
  oldProduct: string;
  newProduct: string;
}) {
  return logConfigurationDrift({
    type: 'APP_PRODUCT_CHANGED',
    ...params,
  });
}

/**
 * Convenience helper: Log app version change
 */
export async function logAppVersionChanged(params: {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  port: number;
  product: string;
  oldVersion: string;
  newVersion: string;
}) {
  return logConfigurationDrift({
    type: 'APP_VERSION_CHANGED',
    ...params,
  });
}

/**
 * Convenience helper: Log web title change
 */
export async function logWebTitleChanged(params: {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  port: number;
  oldTitle: string;
  newTitle: string;
}) {
  return logConfigurationDrift({
    type: 'WEB_TITLE_CHANGED',
    ...params,
  });
}

/**
 * Convenience helper: Log manual edit
 */
export async function logManualEdit(params: {
  organizationId: string;
  deviceId: string;
  deviceName: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  editedBy?: string;
}) {
  return logConfigurationDrift({
    type: 'MANUAL_EDIT',
    ...params,
  });
}
