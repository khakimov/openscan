import { and, eq, lt } from 'drizzle-orm';
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

export async function upsertNotification(
  input: CreateNotificationInput
): Promise<UpsertNotificationResult | null> {
  try {
    const validated = CreateNotificationSchema.parse(input);
    const db = getDb();

    const id = createId();
    const messageHash = hashMessage(validated.title, validated.message);

    await db
      .update(notifications)
      .set({ isActive: false })
      .where(
        and(
          eq(notifications.organizationId, validated.organizationId),
          eq(notifications.fingerprint, validated.fingerprint),
          lt(notifications.suppressUntil, new Date()),
          eq(notifications.isActive, true)
        )
      );

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
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.message?.includes('UNIQUE constraint failed')) {
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
            updatedAt: new Date(),
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
    logNotificationError(outerError, {
      fingerprint: input.fingerprint,
      organizationId: input.organizationId,
      type: input.type,
      severity: input.severity,
    });

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
