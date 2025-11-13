import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '../../database/setup';
import { notifications } from '../../schema/notifications';
import { MarkAsReadSchema, type MarkAsReadInput } from './schemas';

export async function markNotificationAsRead(
  input: MarkAsReadInput
): Promise<typeof notifications.$inferSelect | null> {
  const validated = MarkAsReadSchema.parse(input);
  const db = getDb();

  const [notification] = await db
    .update(notifications)
    .set({
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, validated.notificationId),
        eq(notifications.organizationId, validated.organizationId)
      )
    )
    .returning();

  return notification || null;
}

export async function markAllNotificationsAsRead(
  organizationId: string
): Promise<number> {
  const db = getDb();

  const result = await db
    .update(notifications)
    .set({
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id });

  return result.length;
}

export async function markNotificationEmailSent(
  notificationId: string,
  organizationId: string
): Promise<typeof notifications.$inferSelect | null> {
  const db = getDb();

  const [notification] = await db
    .update(notifications)
    .set({
      emailSent: true,
      emailSentAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, organizationId)
      )
    )
    .returning();

  return notification || null;
}
