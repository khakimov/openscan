import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { getDb } from '../../database/setup';
import { notifications } from '../../schema/notifications';
import {
  GetNotificationsSchema,
  type GetNotificationsInput,
  GetUnreadCountSchema,
  type GetUnreadCountInput,
} from './schemas';
import { resolveEmailSeverities } from './settings';

export async function getNotifications(
  input: GetNotificationsInput
): Promise<{
  items: Array<typeof notifications.$inferSelect>;
  total: number;
  hasMore: boolean;
}> {
  const validated = GetNotificationsSchema.parse(input);
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, validated.organizationId),
    eq(notifications.isActive, true),
  ];

  if (validated.userId) {
    conditions.push(
      or(
        eq(notifications.userId, validated.userId),
        isNull(notifications.userId)
      )!
    );
  }

  if (validated.deviceId) {
    conditions.push(eq(notifications.deviceId, validated.deviceId));
  }

  if (validated.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  const items = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(validated.limit)
    .offset(validated.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(...conditions));

  return {
    items,
    total: count,
    hasMore: validated.offset + items.length < count,
  };
}

export async function getUnreadNotificationCount(
  input: GetUnreadCountInput
): Promise<number> {
  const validated = GetUnreadCountSchema.parse(input);
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, validated.organizationId),
    isNull(notifications.readAt),
    eq(notifications.isActive, true),
  ];

  if (validated.userId) {
    conditions.push(
      or(
        eq(notifications.userId, validated.userId),
        isNull(notifications.userId)
      )!
    );
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(...conditions));

  return count;
}

/**
 * Get unread notification count with severity breakdown
 *
 * Returns total count plus counts per severity level for indicator color logic.
 *
 * @param input - Organization and optional user ID
 * @returns Object with total and severity-specific counts
 */
export async function getUnreadNotificationCountWithSeverity(
  input: GetUnreadCountInput
): Promise<{
  total: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
}> {
  const validated = GetUnreadCountSchema.parse(input);
  const db = getDb();

  const conditions = [
    eq(notifications.organizationId, validated.organizationId),
    isNull(notifications.readAt),
    eq(notifications.isActive, true),
  ];

  if (validated.userId) {
    conditions.push(
      or(
        eq(notifications.userId, validated.userId),
        isNull(notifications.userId)
      )!
    );
  }

  const [result] = await db
    .select({
      total: sql<number>`count(*)`,
      criticalCount: sql<number>`count(case when ${notifications.severity} = 'CRITICAL' then 1 end)`,
      highCount: sql<number>`count(case when ${notifications.severity} = 'HIGH' then 1 end)`,
      mediumCount: sql<number>`count(case when ${notifications.severity} = 'MEDIUM' then 1 end)`,
      lowCount: sql<number>`count(case when ${notifications.severity} = 'LOW' then 1 end)`,
      infoCount: sql<number>`count(case when ${notifications.severity} = 'INFO' then 1 end)`,
    })
    .from(notifications)
    .where(and(...conditions));

  return result;
}

/**
 * Get pending email notifications (filtered by org email severity settings)
 *
 * Pattern: Mirrors legacy VulnerabilityManager.filter_out_vulns_not_match_to_user
 * - Legacy filtered CVEs by user preference before email dispatch
 * - New implementation filters by org-level settings
 * - Uses resolveEmailSeverities() for configurable severity threshold
 * - Cached settings prevent DB hammering during email worker polling
 *
 * Default behavior (no settings configured):
 * - Returns CRITICAL + HIGH notifications (matches legacy hardcoded filter)
 *
 * Empty array contract:
 * - If allowedSeverities is [], alerts are disabled → returns empty array
 * - Avoids inArray() crash (Drizzle rejects empty values array)
 *
 * Usage:
 * ```typescript
 * // Email worker loop
 * const pending = await getPendingEmailNotifications('org_123');
 * // Returns notifications matching org's configured severities
 * ```
 *
 * @param organizationId - Organization ID
 * @param limit - Max notifications to return (default: 100)
 * @returns Array of notifications ready for email delivery
 */
export async function getPendingEmailNotifications(
  organizationId: string,
  limit = 100
): Promise<Array<typeof notifications.$inferSelect>> {
  const db = getDb();

  // Resolve allowed severities from org settings (with caching)
  const allowedSeverities = await resolveEmailSeverities(organizationId);

  // Short-circuit: if alerts disabled (empty array), return empty result
  // Prevents inArray() crash (Drizzle rejects empty values array)
  if (allowedSeverities.length === 0) {
    return [];
  }

  // Filter by emailSent=false, isActive=true, and allowed severities
  return await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.emailSent, false),
        eq(notifications.isActive, true),
        inArray(notifications.severity, allowedSeverities)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
