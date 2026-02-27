/**
 * Server Promoted Notification Helper
 *
 * Sends celebration notification when a device is promoted from CANDIDATE to VERIFIED.
 * Triggered from device update mutations (not scan postback flow).
 */

import { createServerPromotedNotification, createNotifications } from '@repo/data-ops';
import type { StoredNotification } from './delivery-queue';

/**
 * Notify that a server has been promoted to VERIFIED status
 *
 * Usage:
 * ```typescript
 * const previousStatus = device.verificationStatus;
 * await updateDevice(deviceId, { verificationStatus: 'VERIFIED' }, orgId);
 * await notifyServerPromoted({ deviceId, deviceName, organizationId, previousStatus, newStatus: 'VERIFIED' }, env);
 * ```
 */
export async function notifyServerPromoted(
  params: {
    deviceId: string;
    deviceName: string;
    organizationId: string;
    previousStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | null;
    newStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  },
  env: Env
): Promise<void> {
  const { deviceId, deviceName, organizationId, previousStatus, newStatus } = params;

  // Check if actually promoted
  const wasPromoted = previousStatus !== 'VERIFIED' && newStatus === 'VERIFIED';
  if (!wasPromoted) {
    return; // No notification needed
  }

  // Create notification descriptor
  const notification = createServerPromotedNotification({ deviceName });

  // Calculate suppression window (1 week - this is a one-time celebration)
  const suppressUntil = new Date();
  suppressUntil.setDate(suppressUntil.getDate() + 7);

  // Store notification in database
  const createdNotifications = await createNotifications([
    {
      organizationId,
      deviceId,
      severity: notification.severity,
      type: notification.type,
      module: notification.module,
      title: notification.title,
      message: notification.message ?? null,
      data: { deviceName },
      fingerprint: `server_promoted:${deviceId}`, // One-time notification per device
      suppressUntil,
    },
  ]);

  if (createdNotifications.length === 0) {
    console.warn('Failed to store server promotion notification', { deviceId, organizationId });
    return;
  }

  // Map to StoredNotification format for delivery queue
  const created = createdNotifications[0];

  const stored: StoredNotification = {
    id: created.id,
    organizationId: created.organizationId,
    deviceId: created.deviceId,
    severity: created.severity,
    type: created.type,
    title: created.title,
    message: created.message,
    data: created.data ?? { deviceName },
  };

  // Enqueue for email delivery (dynamic import to avoid Vite bundling conflicts)
  const { enqueueNotificationDelivery } = await import('./delivery-queue');
  await enqueueNotificationDelivery([stored], env);
}
