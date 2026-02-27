/**
 * Notification Delivery Queue Helper
 *
 * Purpose: Enqueue notification delivery jobs to Cloudflare Queue for async email/telegram delivery
 *
 * Pattern:
 * - Called after storeNotifications in change-detector
 * - Filters notifications by org severity preferences (resolveEmailSeverities)
 * - Enqueues one job per allowed notification to NOTIFICATION_DELIVERY_PRODUCER
 * - Worker (data-service) consumes jobs and sends actual emails
 *
 * Usage:
 * ```typescript
 * const stored = await storeNotifications(notifications);
 * await enqueueNotificationDelivery(stored, env);
 * ```
 */

import {
  resolveEmailSeverities,
  getOrganizationMemberEmails,
  getOrganizationById,
  getDeviceById,
  type NotificationSeverity,
} from '@repo/data-ops';
import type { notifications } from '@repo/data-ops/schema/notifications';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'delivery-queue' });

/**
 * Notification delivery job payload
 *
 * Sent to Cloudflare Queue → consumed by data-service worker
 */
export interface NotificationDeliveryJob {
  notificationId: string;
  organizationId: string;
  deviceId?: string;
  severity: NotificationSeverity;
  targetChannels: ('email' | 'telegram')[];
  recipients: string[];
  eventType: string;
  payload: Record<string, unknown>;
  // Catalog-derived notification text (single source of truth)
  notificationTitle: string;
  notificationMessage?: string;
  // Optional: group notifications from the same scan
  scanRunId?: string;
  isBatch?: boolean; // True if this job represents multiple notifications
  batchItems?: NotificationBatchItem[]; // Individual notifications in the batch
}

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

type DbNotification = typeof notifications.$inferSelect;

/**
 * Stored notification from change-detector
 *
 * Mirrors the structure returned by createNotifications (typeof notifications.$inferSelect)
 */
export type StoredNotification = Pick<
  DbNotification,
  'id' | 'organizationId' | 'deviceId' | 'severity' | 'type' | 'title' | 'message' | 'data'
>;

/**
 * Enqueue notification delivery jobs
 *
 * Steps:
 * 1. Load org notification settings (resolveEmailSeverities)
 * 2. Filter notifications by allowed severities
 * 3. For each allowed notification, enqueue delivery job
 *
 * @param notifications - Stored notifications from upsertNotificationBatch
 * @param env - Cloudflare Worker environment (contains NOTIFICATION_DELIVERY_PRODUCER)
 * @param options - Optional batching configuration
 */
export async function enqueueNotificationDelivery(
  notifications: StoredNotification[],
  env: Env,
  options?: {
    scanRunId?: string; // If provided, batch all notifications into one email per org
  }
): Promise<void> {
  if (notifications.length === 0) {
    logger.debug('No notifications to enqueue');
    return;
  }

  // Group by organization to batch severity lookups
  const byOrg = new Map<string, StoredNotification[]>();
  for (const notification of notifications) {
    const existing = byOrg.get(notification.organizationId) ?? [];
    existing.push(notification);
    byOrg.set(notification.organizationId, existing);
  }

  const jobs: NotificationDeliveryJob[] = [];

  // Process each organization
  for (const [organizationId, orgNotifications] of byOrg) {
    // Load allowed severities for this org
    const allowedSeverities = await resolveEmailSeverities(organizationId);

    if (allowedSeverities.length === 0) {
      logger.debug('Email alerts disabled for organization, skipping', {
        organizationId,
        notificationCount: orgNotifications.length,
      });
      continue;
    }

    // Load organization member emails
    const recipients = await getOrganizationMemberEmails(organizationId);

    if (recipients.length === 0) {
      logger.warn('No recipients found for organization, skipping', {
        organizationId,
        notificationCount: orgNotifications.length,
      });
      continue;
    }

    // Filter notifications by severity
    const filtered = orgNotifications.filter((n) =>
      allowedSeverities.includes(n.severity as NotificationSeverity)
    );

    logger.debug('Filtered notifications by severity', {
      organizationId,
      total: orgNotifications.length,
      allowed: filtered.length,
      allowedSeverities,
      recipients: recipients.length,
    });

    // Load organization info for URL building (use data-ops query)
    const org = await getOrganizationById(organizationId);
    const orgSlugOrId = org?.slug || organizationId;

    // If scanRunId is provided and we have multiple notifications, batch them
    const shouldBatch = options?.scanRunId && filtered.length > 1;

    if (shouldBatch) {
      // Create one batch job for all notifications from this scan
      const batchItems: NotificationBatchItem[] = [];
      let highestSeverity: NotificationSeverity = 'INFO';
      const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };

      for (const notification of filtered) {
        // Track highest severity for the batch
        if (severityRank[notification.severity as NotificationSeverity] > severityRank[highestSeverity]) {
          highestSeverity = notification.severity as NotificationSeverity;
        }

        // Enrich payload with device information
        const basePayload =
          notification.data && typeof notification.data === 'object'
            ? { ...notification.data }
            : {};
        let enrichedPayload: Record<string, unknown> = basePayload;

        // Map notification.data fields to email template expected fields
        if (notification.type === 'NEW_PORT' && enrichedPayload.port) {
          enrichedPayload.portDisplay = String(enrichedPayload.port);
          enrichedPayload.detectedService = enrichedPayload.service;
        }

        if (notification.deviceId) {
          const device = await getDeviceById(notification.deviceId, organizationId);
          if (device) {
            const deviceNameOrIp = device.name || device.ip || 'Unknown server';
            const activityUrl = device.projectId
              ? `https://sec.rocks/${orgSlugOrId}/${device.projectId}/servers/${notification.deviceId}/activity`
              : `https://sec.rocks/${orgSlugOrId}/servers/${notification.deviceId}/activity`;

            enrichedPayload = {
              ...enrichedPayload,
              deviceName: deviceNameOrIp,
              deviceIp: device.ip,
              scanLink: activityUrl,
            };
          }
        }

        batchItems.push({
          notificationId: notification.id,
          deviceId: notification.deviceId ?? undefined,
          severity: notification.severity as NotificationSeverity,
          eventType: notification.type,
          title: notification.title,
          message: notification.message ?? undefined,
          payload: enrichedPayload,
        });
      }

      // Create single batch job
      jobs.push({
        notificationId: `batch-${options.scanRunId}`, // Synthetic ID for batch
        organizationId,
        deviceId: batchItems[0]?.deviceId, // Use first device for context
        severity: highestSeverity,
        targetChannels: ['email'],
        recipients,
        eventType: 'SCAN_BATCH', // Special event type for batched notifications
        payload: {
          scanRunId: options.scanRunId,
          notificationCount: batchItems.length,
        },
        notificationTitle: `Scan completed: ${batchItems.length} change${batchItems.length === 1 ? '' : 's'} detected`,
        notificationMessage: `Security scan found ${batchItems.length} change${batchItems.length === 1 ? '' : 's'} on your monitored servers.`,
        scanRunId: options.scanRunId,
        isBatch: true,
        batchItems,
      });
    } else {
      // Create individual jobs (original behavior)
      for (const notification of filtered) {
      // Enrich payload with device and URL information
      const basePayload =
        notification.data && typeof notification.data === 'object'
          ? { ...notification.data }
          : {};
      let enrichedPayload: Record<string, unknown> = basePayload;

      // Map notification.data fields to email template expected fields
      // Port notifications: port → portDisplay, service → detectedService
      if (notification.type === 'NEW_PORT' && enrichedPayload.port) {
        enrichedPayload.portDisplay = String(enrichedPayload.port);
        enrichedPayload.detectedService = enrichedPayload.service;
      }

      if (notification.deviceId) {
        // Use data-ops query instead of raw SQL
        const device = await getDeviceById(notification.deviceId, organizationId);

        if (device) {
          const deviceNameOrIp = device.name || device.ip || 'Unknown server';

          // Build activity URL: /{orgSlug}/{projectId}/servers/{deviceId}/activity
          const activityUrl = device.projectId
            ? `https://sec.rocks/${orgSlugOrId}/${device.projectId}/servers/${notification.deviceId}/activity`
            : `https://sec.rocks/${orgSlugOrId}/servers/${notification.deviceId}/activity`;

          enrichedPayload = {
            ...enrichedPayload,
            deviceName: deviceNameOrIp,
            deviceIp: device.ip,
            scanLink: activityUrl,
          };
        }
      }

        jobs.push({
          notificationId: notification.id,
          organizationId: notification.organizationId,
          deviceId: notification.deviceId ?? undefined,
          severity: notification.severity as NotificationSeverity,
          targetChannels: ['email'],
          recipients,
          eventType: notification.type, // Map database 'type' field to queue 'eventType'
          payload: enrichedPayload, // Use enriched payload with device info and URL
          // Pass catalog text to email templates (single source of truth)
          notificationTitle: notification.title,
          notificationMessage: notification.message ?? undefined,
        });
      }
    }
  }

  if (jobs.length === 0) {
    logger.debug('No notifications passed severity filter');
    return;
  }

  // Enqueue to Cloudflare Queue
  try {
    await env.NOTIFICATION_DELIVERY_PRODUCER.sendBatch(
      jobs.map((job) => ({ body: job }))
    );

    logger.info('Enqueued notification delivery jobs', {
      count: jobs.length,
      organizations: Array.from(byOrg.keys()),
      severities: [...new Set(jobs.map(j => j.severity))],
      eventTypes: [...new Set(jobs.map(j => j.eventType))],
      recipients: jobs[0]?.recipients.length ?? 0, // All jobs have same recipients per org
    });
  } catch (error) {
    logger.error('Failed to enqueue notification delivery jobs', {
      error: error instanceof Error ? error.message : String(error),
      jobCount: jobs.length,
    });
    throw error;
  }
}
