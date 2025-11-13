/**
 * Notification Preferences Normalization
 *
 * Centralizes the "empty array disables alerts" contract and default flags
 * in one utility, used both when fetching and before saving.
 *
 * Benefits:
 * - Server & UI share same defaults (single source of truth)
 * - "Enabled" logic lives in one place (severities.length > 0)
 * - Future preference fields added once
 *
 * Pattern from OpenPanel:
 * https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
 */

/**
 * Raw notification preferences from database/API
 */
export interface RawNotificationPreferences {
  severities?: string[];
  vulnerabilityAlertsEnabled?: boolean;
  weeklySummaryEnabled?: boolean;
}

/**
 * Normalized notification preferences (client-safe)
 */
export interface NormalizedNotificationPreferences {
  vulnerabilityAlertsEnabled: boolean;
  alertSeverities: string[];
  weeklySummaryEnabled: boolean;
}

/**
 * Allowed severities (matches normalizeNotification() whitelist)
 */
const ALLOWED_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const);

/**
 * Normalize notification preferences from raw database/API response
 *
 * Business Rules:
 * - If `severities` array is empty → alerts are disabled
 * - If `severities` array has items → alerts are enabled
 * - Only allowed severities are preserved (security whitelist)
 * - Weekly summary defaults to true
 *
 * Usage in server (fetching):
 * ```typescript
 * const raw = await preferencesService.getNotificationPreferences({ organizationId, userId });
 * const normalized = normalizeNotificationPreferences(raw);
 * return { success: true, preferences: normalized };
 * ```
 *
 * Usage in server (saving):
 * ```typescript
 * const normalized = normalizeNotificationPreferences(input);
 * await preferencesService.saveNotificationPreferences({
 *   organizationId,
 *   userId,
 *   severities: normalized.alertSeverities,
 * });
 * ```
 *
 * Usage in UI forms:
 * ```typescript
 * const { data } = useQuery({
 *   queryKey: ['notification-preferences'],
 *   queryFn: () => getNotificationPreferences(),
 * });
 *
 * // data.preferences is already normalized - use directly
 * const initialValues = data?.preferences ?? normalizeNotificationPreferences(null);
 * ```
 *
 * @param raw - Raw preferences from database/API (may be null/undefined)
 * @returns Normalized preferences with safe defaults
 */
export function normalizeNotificationPreferences(
  raw: RawNotificationPreferences | null | undefined
): NormalizedNotificationPreferences {
  // Filter severities to only allowed values (security guard)
  const severities = Array.isArray(raw?.severities)
    ? raw.severities.filter((severity): severity is string =>
        typeof severity === 'string' && ALLOWED_SEVERITIES.has(severity as any)
      )
    : [];

  // Business rule: alerts are enabled if severities array is not empty
  // (explicit flag can override, but array emptiness is canonical)
  const enabled = raw?.vulnerabilityAlertsEnabled ?? severities.length > 0;

  return {
    vulnerabilityAlertsEnabled: enabled,
    alertSeverities: enabled ? severities : [],
    weeklySummaryEnabled: raw?.weeklySummaryEnabled ?? true,
  };
}
