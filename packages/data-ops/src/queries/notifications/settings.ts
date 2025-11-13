/**
 * Organization Notification Settings Queries
 *
 * Purpose: Manage email notification preferences at the organization level
 *
 * Pattern: Mirrors legacy UserCredentials.raw_new_vulns_emails (CSV of severities)
 * but stored at the org level instead of per-user.
 *
 * Key Features:
 * - One settings row per organization (1:1 relationship)
 * - Controls which severities trigger email alerts
 * - In-memory cache to avoid DB hammering during email worker polling
 * - Automatic fallback to defaults (['CRITICAL', 'HIGH'])
 *
 * Cache Behavior:
 * - In-memory Map-based cache with 5-minute TTL
 * - Per-process cache (no cross-process invalidation)
 * - If deploying multiple worker processes, each maintains separate cache
 * - Cache is eventually consistent via TTL expiration
 *
 * Usage:
 * ```typescript
 * // Get allowed severities for email filtering
 * const severities = await resolveEmailSeverities('org_123');
 * // Returns: ['CRITICAL', 'HIGH'] (default) or custom setting
 *
 * // Update org settings
 * await updateEmailSeverities('org_123', ['CRITICAL', 'HIGH', 'MEDIUM']);
 * ```
 *
 * See: docs/NOTIFICATIONS/design-decisions.md for configuration guide
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../database/setup';
import { organizationNotificationSettings } from '../../schema/notifications';
import { createId } from '@paralleldrive/cuid2';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'notification-settings' });

// ============================================================================
// Schemas
// ============================================================================

export const NotificationSeveritySchema = z.enum([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
]);

export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const UpdateEmailSeveritiesSchema = z.object({
  organizationId: z.string().min(1),
  emailAllowedSeverities: z.array(NotificationSeveritySchema).min(1),
});

export type UpdateEmailSeveritiesInput = z.infer<
  typeof UpdateEmailSeveritiesSchema
>;

// Schema that allows empty array (for disabling alerts)
export const UpdateEmailSeveritiesOrDisableSchema = z.object({
  organizationId: z.string().min(1),
  emailAllowedSeverities: z.array(NotificationSeveritySchema), // No .min(1) - allows empty
});

export type UpdateEmailSeveritiesOrDisableInput = z.infer<
  typeof UpdateEmailSeveritiesOrDisableSchema
>;

// ============================================================================
// In-Memory Cache
// ============================================================================

/**
 * Cache entry for notification settings
 *
 * Pattern: Simple Map-based cache with TTL to avoid DB hammering
 * - Email worker polls frequently → cache prevents DB overload
 * - TTL ensures fresh data (5 minutes default)
 * - Cleared on update to ensure consistency
 */
interface CacheEntry {
  severities: NotificationSeverity[];
  fetchedAt: number;
}

const settingsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cache entry for organization
 *
 * Called after settings update to ensure fresh data
 */
function clearCache(organizationId: string): void {
  settingsCache.delete(organizationId);
  logger.debug('Cleared notification settings cache', { organizationId });
}

/**
 * Get cached settings if valid
 *
 * Returns null if cache miss or expired
 * Returns a cloned array to prevent caller mutations from poisoning the cache
 */
function getCached(organizationId: string): NotificationSeverity[] | null {
  const entry = settingsCache.get(organizationId);
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAt;
  if (age > CACHE_TTL_MS) {
    settingsCache.delete(organizationId);
    return null;
  }

  logger.debug('Cache hit for notification settings', {
    organizationId,
    ageMs: age,
  });
  // Clone before returning to prevent caller mutations
  return [...entry.severities];
}

/**
 * Store settings in cache
 *
 * Stores a cloned array to prevent caller mutations from poisoning the cache
 */
function setCache(
  organizationId: string,
  severities: NotificationSeverity[]
): void {
  settingsCache.set(organizationId, {
    // Clone before storing to prevent caller mutations
    severities: [...severities],
    fetchedAt: Date.now(),
  });
  logger.debug('Cached notification settings', { organizationId, severities });
}

// ============================================================================
// Default Settings
// ============================================================================

/**
 * Default email severities (matches legacy hardcoded filter)
 *
 * Legacy: getPendingEmailNotifications hardcoded CRITICAL/HIGH
 * New: Same defaults, but configurable per org
 */
export const DEFAULT_EMAIL_SEVERITIES: NotificationSeverity[] = [
  'CRITICAL',
  'HIGH',
];

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get organization notification settings
 *
 * Returns null if no settings row exists (use defaults)
 *
 * @param organizationId - Organization ID
 * @returns Settings row or null
 */
export async function getOrganizationNotificationSettings(
  organizationId: string
): Promise<typeof organizationNotificationSettings.$inferSelect | null> {
  const db = getDb();

  const [settings] = await db
    .select()
    .from(organizationNotificationSettings)
    .where(eq(organizationNotificationSettings.organizationId, organizationId))
    .limit(1);

  return settings ?? null;
}

/**
 * Resolve email severities for organization
 *
 * Pattern: Fallback chain with caching
 * 1. Check cache (fast path)
 * 2. Query database
 * 3. Parse JSON array
 * 4. Handle empty array (alerts disabled)
 * 5. Fallback to defaults if missing/invalid
 * 6. Cache result (cloned)
 * 7. Return cloned array (defense-in-depth)
 *
 * Used by email worker to filter pending notifications.
 *
 * @param organizationId - Organization ID
 * @returns Cloned array of allowed severities (empty array = alerts disabled)
 */
export async function resolveEmailSeverities(
  organizationId: string
): Promise<NotificationSeverity[]> {
  // Fast path: check cache (already returns a clone)
  const cached = getCached(organizationId);
  if (cached !== null) {
    return cached;
  }

  // Slow path: query database
  const settings = await getOrganizationNotificationSettings(organizationId);

  let severities: NotificationSeverity[];

  if (!settings || !settings.emailAllowedSeverities) {
    // No settings → use defaults (defensive copy to prevent mutation)
    severities = [...DEFAULT_EMAIL_SEVERITIES];
    logger.debug('Using default email severities (no settings)', {
      organizationId,
      severities,
    });
  } else {
    // Parse JSON array
    try {
      const parsed = settings.emailAllowedSeverities as unknown;

      // Validate array of severities
      if (
        Array.isArray(parsed) &&
        parsed.every((s) => NotificationSeveritySchema.safeParse(s).success)
      ) {
        severities = parsed as NotificationSeverity[];

        if (severities.length === 0) {
          // Empty array = alerts explicitly disabled
          logger.debug('Email alerts disabled (empty severities)', {
            organizationId,
          });
        } else {
          logger.debug('Resolved email severities from settings', {
            organizationId,
            severities,
          });
        }
      } else {
        // Invalid data → fallback to defaults (defensive copy)
        logger.warn('Invalid emailAllowedSeverities, using defaults', {
          organizationId,
          invalid: parsed,
        });
        severities = [...DEFAULT_EMAIL_SEVERITIES];
      }
    } catch (error) {
      // JSON parse error → fallback to defaults (defensive copy)
      logger.error('Failed to parse emailAllowedSeverities', {
        organizationId,
        error,
      });
      severities = [...DEFAULT_EMAIL_SEVERITIES];
    }
  }

  // Cache result (setCache clones internally)
  setCache(organizationId, severities);

  // Return fresh clone (defense-in-depth: protects cache from caller mutations)
  return [...severities];
}

/**
 * Update email allowed severities for organization
 *
 * Pattern: True upsert using onConflictDoUpdate
 * - Atomically inserts or updates based on organizationId unique constraint
 * - No race condition window between read-then-insert
 * - Safe for concurrent updates (double submit, parallel workers)
 * - Clears cache to ensure fresh reads
 *
 * @param input - Organization ID and email severities array
 * @returns Updated settings row
 */
export async function updateEmailSeverities(
  input: UpdateEmailSeveritiesInput
): Promise<typeof organizationNotificationSettings.$inferSelect> {
  const validated = UpdateEmailSeveritiesSchema.parse(input);
  const db = getDb();

  // True upsert: insert with conflict resolution on organizationId
  const [settings] = await db
    .insert(organizationNotificationSettings)
    .values({
      id: createId(),
      organizationId: validated.organizationId,
      emailAllowedSeverities: validated.emailAllowedSeverities as any,
    })
    .onConflictDoUpdate({
      target: organizationNotificationSettings.organizationId,
      set: {
        emailAllowedSeverities: validated.emailAllowedSeverities as any,
        updatedAt: new Date(),
      },
    })
    .returning();

  logger.info('Upserted email severities', {
    organizationId: validated.organizationId,
    severities: validated.emailAllowedSeverities,
  });

  // Clear cache to ensure fresh reads
  clearCache(validated.organizationId);

  return settings!;
}

/**
 * Update email severities or disable alerts entirely
 *
 * Allows setting empty array to disable all email alerts
 * Empty array contract: email worker sees [] and skips notification delivery
 *
 * @param input - Organization ID and email severities array (may be empty)
 * @returns Updated settings row
 */
export async function updateEmailSeveritiesOrDisable(
  input: UpdateEmailSeveritiesOrDisableInput
): Promise<typeof organizationNotificationSettings.$inferSelect> {
  const validated = UpdateEmailSeveritiesOrDisableSchema.parse(input);
  const db = getDb();

  // True upsert: insert with conflict resolution on organizationId
  const [settings] = await db
    .insert(organizationNotificationSettings)
    .values({
      id: createId(),
      organizationId: validated.organizationId,
      emailAllowedSeverities: validated.emailAllowedSeverities as any,
    })
    .onConflictDoUpdate({
      target: organizationNotificationSettings.organizationId,
      set: {
        emailAllowedSeverities: validated.emailAllowedSeverities as any,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (validated.emailAllowedSeverities.length === 0) {
    logger.info('Disabled email alerts (empty severities)', {
      organizationId: validated.organizationId,
    });
  } else {
    logger.info('Upserted email severities', {
      organizationId: validated.organizationId,
      severities: validated.emailAllowedSeverities,
    });
  }

  // Clear cache to ensure fresh reads
  clearCache(validated.organizationId);

  return settings!;
}

/**
 * Reset email severities to defaults
 *
 * Convenience wrapper for updateEmailSeverities
 * Passes a cloned array to prevent mutation of global defaults
 *
 * @param organizationId - Organization ID
 * @returns Updated settings row
 */
export async function resetEmailSeveritiesToDefaults(
  organizationId: string
): Promise<typeof organizationNotificationSettings.$inferSelect> {
  return updateEmailSeverities({
    organizationId,
    // Clone to prevent mutation of global defaults
    emailAllowedSeverities: [...DEFAULT_EMAIL_SEVERITIES],
  });
}
