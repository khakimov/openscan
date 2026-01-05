/**
 * User Notification Preferences Queries
 *
 * Purpose: Manage per-user notification preferences that override organization defaults
 *
 * Priority Chain for resolving preferences:
 * 1. User preferences (if exists for this user + org)
 * 2. Organization settings (if exists)
 * 3. System defaults (CRITICAL, HIGH)
 *
 * Key Features:
 * - emailEnabled: opt-in/opt-out of all email notifications
 * - emailAllowedSeverities: override org severity filter (null = inherit)
 * - mutedDevices: silence notifications for specific devices
 * - telegramEnabled + telegramChatId: future Telegram support
 */

import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../database/setup';
import { userNotificationPreferences } from '../../schema/notifications';
import { createId } from '@paralleldrive/cuid2';
import { createLogger } from '@repo/logger';
import {
  resolveEmailSeverities,
  NotificationSeveritySchema,
  type NotificationSeverity,
  DEFAULT_EMAIL_SEVERITIES,
} from './settings';

const logger = createLogger({ name: 'user-notification-preferences' });

// ============================================================================
// Schemas
// ============================================================================

export const GetUserPreferencesSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
});

export type GetUserPreferencesInput = z.infer<typeof GetUserPreferencesSchema>;

export const UpdateUserPreferencesSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  emailEnabled: z.boolean().optional(),
  emailAllowedSeverities: z.array(NotificationSeveritySchema).nullable().optional(),
  mutedDevices: z.array(z.string()).optional(),
  telegramEnabled: z.boolean().optional(),
  telegramChatId: z.string().nullable().optional(),
});

export type UpdateUserPreferencesInput = z.infer<typeof UpdateUserPreferencesSchema>;

export const MuteDeviceSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  deviceId: z.string().min(1),
});

export type MuteDeviceInput = z.infer<typeof MuteDeviceSchema>;

// ============================================================================
// Types
// ============================================================================

export interface ResolvedUserPreferences {
  emailEnabled: boolean;
  emailAllowedSeverities: NotificationSeverity[];
  mutedDevices: string[];
  telegramEnabled: boolean;
  telegramChatId: string | null;
  source: 'user' | 'organization' | 'defaults';
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get user notification preferences
 *
 * Returns null if no preferences row exists (use org defaults)
 */
export async function getUserNotificationPreferences(
  input: GetUserPreferencesInput
): Promise<typeof userNotificationPreferences.$inferSelect | null> {
  const validated = GetUserPreferencesSchema.parse(input);
  const db = getDb();

  const [prefs] = await db
    .select()
    .from(userNotificationPreferences)
    .where(
      and(
        eq(userNotificationPreferences.userId, validated.userId),
        eq(userNotificationPreferences.organizationId, validated.organizationId)
      )
    )
    .limit(1);

  return prefs ?? null;
}

/**
 * Resolve effective user preferences
 *
 * Follows priority chain:
 * 1. User preferences (if exists)
 * 2. Organization settings (if exists)
 * 3. System defaults
 *
 * Returns fully resolved preferences with source indicator
 */
export async function resolveUserPreferences(
  input: GetUserPreferencesInput
): Promise<ResolvedUserPreferences> {
  const validated = GetUserPreferencesSchema.parse(input);

  // Check user preferences first
  const userPrefs = await getUserNotificationPreferences(validated);

  if (userPrefs) {
    // User has explicit preferences
    let severities: NotificationSeverity[];

    if (userPrefs.emailAllowedSeverities && Array.isArray(userPrefs.emailAllowedSeverities)) {
      // User has custom severity override
      severities = userPrefs.emailAllowedSeverities as NotificationSeverity[];
    } else {
      // Inherit from organization
      severities = await resolveEmailSeverities(validated.organizationId);
    }

    logger.debug('Resolved user preferences from user settings', {
      userId: validated.userId,
      organizationId: validated.organizationId,
      emailEnabled: userPrefs.emailEnabled,
      severities,
    });

    return {
      emailEnabled: userPrefs.emailEnabled,
      emailAllowedSeverities: severities,
      mutedDevices: (userPrefs.mutedDevices as string[]) ?? [],
      telegramEnabled: userPrefs.telegramEnabled,
      telegramChatId: userPrefs.telegramChatId,
      source: 'user',
    };
  }

  // Fall back to organization settings
  const orgSeverities = await resolveEmailSeverities(validated.organizationId);

  logger.debug('Resolved user preferences from organization defaults', {
    userId: validated.userId,
    organizationId: validated.organizationId,
    severities: orgSeverities,
  });

  return {
    emailEnabled: true,
    emailAllowedSeverities: orgSeverities,
    mutedDevices: [],
    telegramEnabled: false,
    telegramChatId: null,
    source: orgSeverities === DEFAULT_EMAIL_SEVERITIES ? 'defaults' : 'organization',
  };
}

/**
 * Update user notification preferences (upsert)
 *
 * Creates or updates preferences for a user in an organization
 */
export async function updateUserNotificationPreferences(
  input: UpdateUserPreferencesInput
): Promise<typeof userNotificationPreferences.$inferSelect> {
  const validated = UpdateUserPreferencesSchema.parse(input);
  const db = getDb();

  // Build update values (only include provided fields)
  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (validated.emailEnabled !== undefined) {
    updateValues.emailEnabled = validated.emailEnabled;
  }
  if (validated.emailAllowedSeverities !== undefined) {
    updateValues.emailAllowedSeverities = validated.emailAllowedSeverities;
  }
  if (validated.mutedDevices !== undefined) {
    updateValues.mutedDevices = validated.mutedDevices;
  }
  if (validated.telegramEnabled !== undefined) {
    updateValues.telegramEnabled = validated.telegramEnabled;
  }
  if (validated.telegramChatId !== undefined) {
    updateValues.telegramChatId = validated.telegramChatId;
  }

  // Upsert using onConflictDoUpdate
  const [prefs] = await db
    .insert(userNotificationPreferences)
    .values({
      id: createId(),
      userId: validated.userId,
      organizationId: validated.organizationId,
      emailEnabled: validated.emailEnabled ?? true,
      emailAllowedSeverities: validated.emailAllowedSeverities as any,
      mutedDevices: validated.mutedDevices ?? [],
      telegramEnabled: validated.telegramEnabled ?? false,
      telegramChatId: validated.telegramChatId ?? null,
    })
    .onConflictDoUpdate({
      target: [userNotificationPreferences.userId, userNotificationPreferences.organizationId],
      set: updateValues as any,
    })
    .returning();

  logger.info('Updated user notification preferences', {
    userId: validated.userId,
    organizationId: validated.organizationId,
  });

  return prefs!;
}

/**
 * Mute a device for a user (add to mutedDevices array)
 */
export async function muteDevice(input: MuteDeviceInput): Promise<void> {
  const validated = MuteDeviceSchema.parse(input);

  // Get current preferences
  const prefs = await getUserNotificationPreferences({
    userId: validated.userId,
    organizationId: validated.organizationId,
  });

  const currentMuted = (prefs?.mutedDevices as string[]) ?? [];

  // Add device if not already muted
  if (!currentMuted.includes(validated.deviceId)) {
    await updateUserNotificationPreferences({
      userId: validated.userId,
      organizationId: validated.organizationId,
      mutedDevices: [...currentMuted, validated.deviceId],
    });

    logger.info('Muted device for user', {
      userId: validated.userId,
      deviceId: validated.deviceId,
    });
  }
}

/**
 * Unmute a device for a user (remove from mutedDevices array)
 */
export async function unmuteDevice(input: MuteDeviceInput): Promise<void> {
  const validated = MuteDeviceSchema.parse(input);

  // Get current preferences
  const prefs = await getUserNotificationPreferences({
    userId: validated.userId,
    organizationId: validated.organizationId,
  });

  const currentMuted = (prefs?.mutedDevices as string[]) ?? [];

  // Remove device if muted
  if (currentMuted.includes(validated.deviceId)) {
    await updateUserNotificationPreferences({
      userId: validated.userId,
      organizationId: validated.organizationId,
      mutedDevices: currentMuted.filter((id) => id !== validated.deviceId),
    });

    logger.info('Unmuted device for user', {
      userId: validated.userId,
      deviceId: validated.deviceId,
    });
  }
}

/**
 * Disable email notifications for a user
 */
export async function disableEmailNotifications(
  input: GetUserPreferencesInput
): Promise<void> {
  const validated = GetUserPreferencesSchema.parse(input);

  await updateUserNotificationPreferences({
    userId: validated.userId,
    organizationId: validated.organizationId,
    emailEnabled: false,
  });

  logger.info('Disabled email notifications for user', {
    userId: validated.userId,
    organizationId: validated.organizationId,
  });
}

/**
 * Enable email notifications for a user
 */
export async function enableEmailNotifications(
  input: GetUserPreferencesInput
): Promise<void> {
  const validated = GetUserPreferencesSchema.parse(input);

  await updateUserNotificationPreferences({
    userId: validated.userId,
    organizationId: validated.organizationId,
    emailEnabled: true,
  });

  logger.info('Enabled email notifications for user', {
    userId: validated.userId,
    organizationId: validated.organizationId,
  });
}

/**
 * Get all users who should receive email notifications for an organization
 *
 * Returns user IDs that:
 * 1. Have emailEnabled = true (or no preferences = defaults to enabled)
 * 2. Are members of the organization
 *
 * Used by delivery queue to determine recipients
 */
export async function getEmailRecipients(
  organizationId: string,
  deviceId?: string,
  severity?: NotificationSeverity
): Promise<string[]> {
  const db = getDb();

  // Get all user preferences for this org (users who have explicitly set preferences)
  const userPrefs = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.organizationId, organizationId));

  // Build map of user preferences
  const prefsMap = new Map<string, typeof userNotificationPreferences.$inferSelect>();
  for (const pref of userPrefs) {
    prefsMap.set(pref.userId, pref);
  }

  // Get org severity settings for filtering
  const orgSeverities = await resolveEmailSeverities(organizationId);

  // Filter users who should receive emails
  const recipients: string[] = [];

  for (const [userId, pref] of prefsMap) {
    // Skip if email disabled
    if (!pref.emailEnabled) {
      continue;
    }

    // Skip if device is muted
    const mutedDevices = (pref.mutedDevices as string[]) ?? [];
    if (deviceId && mutedDevices.includes(deviceId)) {
      continue;
    }

    // Check severity filter
    if (severity) {
      const userSeverities = pref.emailAllowedSeverities
        ? (pref.emailAllowedSeverities as NotificationSeverity[])
        : orgSeverities;

      if (!userSeverities.includes(severity)) {
        continue;
      }
    }

    recipients.push(userId);
  }

  return recipients;
}
