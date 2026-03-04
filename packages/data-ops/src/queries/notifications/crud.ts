import { and, eq, lt, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

import { getDb } from '../../database/setup';
import { notifications } from '../../schema/notifications';
import {
  logNotificationCreated,
  logNotificationError,
  logSuppressWindowExtended,
  logBatchComplete,
} from '../../notifications/logger';
import { CreateNotificationSchema, type CreateNotificationInput } from './schemas';
import { hashMessage } from './dedupe';

export async function createNotification(
  input: CreateNotificationInput
): Promise<typeof notifications.$inferSelect> {
  const validated = CreateNotificationSchema.parse(input);
  const db = getDb();

  const id = createId();
  const messageHash = hashMessage(validated.title, validated.message);

  const [notification] = await db
    .insert(notifications)
    .values({
      id,
      organizationId: validated.organizationId,
      userId: validated.userId ?? null,
      deviceId: validated.deviceId ?? null,
      scanRunId: validated.scanRunId ?? null,
      type: validated.type,
      severity: validated.severity,
      module: validated.module,
      title: validated.title,
      message: validated.message ?? null,
      data: validated.data ?? null,
      fingerprint: validated.fingerprint,
      messageHash,
      suppressUntil: validated.suppressUntil,
      readAt: null,
      emailSent: false,
      emailSentAt: null,
    })
    .returning();

  return notification;
}

export interface UpsertNotificationResult {
  notification: typeof notifications.$inferSelect;
  wasDuplicate: boolean;
}

/**
 * Suppress window durations in milliseconds
 */
export const SUPPRESS_WINDOWS = {
  // Availability notifications: 15 minutes (fast alerts for outages/recovery)
  SERVICE_DOWN: 15 * 60 * 1000,
  SERVICE_UP: 15 * 60 * 1000,
  // Port changes: 6 hours
  NEW_PORT: 6 * 60 * 60 * 1000,
  CLOSED_PORT: 6 * 60 * 60 * 1000,
  // CVE notifications: 24 hours
  NEW_CVE: 24 * 60 * 60 * 1000,
  CVE_SEVERITY_INCREASE: 24 * 60 * 60 * 1000,
  CVE_FIXED: 24 * 60 * 60 * 1000,
  CVE_REGRESSED: 24 * 60 * 60 * 1000,
  // Service drift: 6 hours
  SERVICE_DRIFT: 6 * 60 * 60 * 1000,
  // Configuration drift
  SERVER_IP_CHANGED: 24 * 60 * 60 * 1000,
  APP_PRODUCT_CHANGED: 12 * 60 * 60 * 1000,
  APP_VERSION_CHANGED: 6 * 60 * 60 * 1000,
  WEB_TITLE_CHANGED: 6 * 60 * 60 * 1000,
  MANUAL_EDIT: 0,
  // Device lifecycle
  SERVER_PROMOTED: 24 * 60 * 60 * 1000,
} as const;

/**
 * Get suppress window duration for a notification type
 */
export function getSuppressWindowDuration(type: string): number {
  return SUPPRESS_WINDOWS[type as keyof typeof SUPPRESS_WINDOWS] ?? 24 * 60 * 60 * 1000;
}

/**
 * Calculate suppress until timestamp using database time for consistency
 * 
 * Uses UTC to avoid timezone issues between application server and database.
 * The suppressUntil is calculated as: NOW (in UTC) + duration milliseconds.
 */
export function calculateSuppressUntil(type: string): Date {
  const duration = getSuppressWindowDuration(type);
  // Use UTC to ensure consistency regardless of server timezone
  return new Date(Date.now() + duration);
}

export async function upsertNotification(
  input: CreateNotificationInput
): Promise<UpsertNotificationResult | null> {
  try {
    const validated = CreateNotificationSchema.parse(input);
    const db = getDb();

    const id = createId();
    const messageHash = hashMessage(validated.title, validated.message);

    // Step 1: Expire any existing notification that has passed its suppress window
    // suppressUntil is stored as milliseconds integer, so compare against epoch ms
    await db
      .update(notifications)
      .set({ isActive: false })
      .where(
        and(
          eq(notifications.organizationId, validated.organizationId),
          eq(notifications.fingerprint, validated.fingerprint),
          lt(notifications.suppressUntil, sql`(strftime('%s','now') * 1000)`),
          eq(notifications.isActive, true)
        )
      );

    // Step 2: Try to insert, fall back to update on unique constraint violation
    try {
      const [inserted] = await db
        .insert(notifications)
        .values({
          id,
          organizationId: validated.organizationId,
          userId: validated.userId ?? null,
          deviceId: validated.deviceId ?? null,
          scanRunId: validated.scanRunId ?? null,
          type: validated.type,
          severity: validated.severity,
          module: validated.module,
          title: validated.title,
          message: validated.message ?? null,
          data: validated.data ?? null,
          fingerprint: validated.fingerprint,
          messageHash,
          suppressUntil: validated.suppressUntil,
          isActive: true,
          readAt: null,
          emailSent: false,
          emailSentAt: null,
        })
        .returning();

      logNotificationCreated(inserted);
      return { notification: inserted, wasDuplicate: false };
    } catch (error: any) {
      // Check for unique constraint violation (active notification with same fingerprint exists)
      const isUniqueViolation = 
        error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || 
        error?.message?.includes('UNIQUE constraint failed');

      if (isUniqueViolation) {
        // Update existing notification (extend suppress window)
        const [updated] = await db
          .update(notifications)
          .set({
            title: validated.title,
            message: validated.message ?? null,
            data: validated.data ?? null,
            messageHash,
            scanRunId: validated.scanRunId ?? null,
            severity: validated.severity,
            type: validated.type,
            module: validated.module,
            suppressUntil: validated.suppressUntil,
            isActive: true,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(notifications.organizationId, validated.organizationId),
              eq(notifications.fingerprint, validated.fingerprint),
              eq(notifications.isActive, true)
            )
          )
          .returning();

        logSuppressWindowExtended(
          validated.fingerprint,
          validated.organizationId,
          validated.suppressUntil
        );
        return { notification: updated, wasDuplicate: true };
      }

      throw error;
    }
  } catch (outerError) {
    // Don't log here — callers (createNotifications, logConfigurationDrift) handle logging
    // to avoid duplicate error logs for the same failure
    throw outerError;
  }
}

export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<Array<typeof notifications.$inferSelect>> {
  if (inputs.length === 0) return [];

  const processed: Array<typeof notifications.$inferSelect> = [];
  let newCount = 0;
  let suppressed = 0;
  let errors = 0;

  for (const input of inputs) {
    try {
      const result = await upsertNotification(input);

      if (result) {
        processed.push(result.notification);

        if (result.wasDuplicate) {
          suppressed++;
        } else {
          newCount++;
        }
      }
    } catch (error) {
      errors++;
      logNotificationError(error, {
        fingerprint: input.fingerprint,
        organizationId: input.organizationId,
        type: input.type,
        severity: input.severity,
      });
    }
  }

  logBatchComplete({
    total: inputs.length,
    processed: processed.length,
    newCount,
    suppressed,
    errors,
  });

  return processed;
}
