/**
 * Notification Normalization Utilities
 *
 * Centralizes data transformation between database records and client-safe structures.
 * Ensures consistent type guards, field defaults, and ISO string conversion in ONE place.
 *
 * Benefits:
 * - Server & client stay aligned (single source of truth)
 * - Security: Type/severity guards in one location
 * - Maintainability: Field changes happen once
 * - Performance: Avoid repeated Date conversions in UI
 *
 * Pattern from OpenPanel:
 * https://github.com/Openpanel-dev/openpanel/blob/main/apps/dashboard/src/utils/normalize.ts
 */

import type { NotificationItem } from '@/server/notifications/types';

/**
 * Allowed notification types (exhaustive security whitelist)
 */
const ALLOWED_TYPES = new Set([
  'NEW_PORT',
  'CLOSED_PORT',
  'NEW_CVE',
  'CVE_SEVERITY_INCREASE',
  'CVE_FIXED',
  'CVE_REGRESSED',
  'SERVICE_DRIFT',
] as const);

export type AllowedNotificationType = typeof ALLOWED_TYPES extends Set<infer T> ? T : never;

/**
 * Allowed severity levels (security whitelist)
 */
const ALLOWED_SEVERITIES = new Set([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'INFO',
] as const);

export type AllowedSeverity = typeof ALLOWED_SEVERITIES extends Set<infer T> ? T : never;

/**
 * Normalize raw database notification record to client-safe structure
 *
 * Guards:
 * - Filters out unknown types (returns null for invalid records)
 * - Defaults severity to 'INFO' if invalid
 * - Converts Date objects to ISO strings
 * - Ensures all required fields have safe defaults
 *
 * Usage in server:
 * ```typescript
 * const result = await getNotifications(params);
 * return {
 *   success: true,
 *   items: result.items.map(normalizeNotification).filter(Boolean), // filter nulls
 *   total: result.total,
 *   hasMore: result.hasMore,
 * };
 * ```
 *
 * @param record - Raw database record with Date objects
 * @returns Normalized notification with ISO strings, or null if invalid type
 */
export function normalizeNotification(record: any): NotificationItem | null {
  if (!record) return null;

  // Type guard: Only allow whitelisted types
  const type = typeof record.type === 'string' && ALLOWED_TYPES.has(record.type as any)
    ? record.type
    : null;

  // Reject records with invalid types (security: prevents rendering unknown notification types)
  if (!type) {
    return null;
  }

  // Severity guard: Default to INFO if invalid
  const severity = typeof record.severity === 'string' && ALLOWED_SEVERITIES.has(record.severity as any)
    ? record.severity
    : 'INFO';

  return {
    id: String(record.id),
    type,
    severity,
    title: record.title ?? 'Notification',
    message: record.message ?? null,
    data: record.data ?? null,
    readAt: record.readAt ? (record.readAt instanceof Date ? record.readAt.toISOString() : record.readAt) : null,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    deviceId: record.deviceId ?? null,
    scanRunId: record.scanRunId ?? null,
  };
}

/**
 * Normalize array of notification records
 *
 * Filters out null results (invalid types)
 *
 * Usage:
 * ```typescript
 * const normalized = normalizeNotificationList(dbRecords);
 * ```
 */
export function normalizeNotificationList(records: any[]): NotificationItem[] {
  return records.map(normalizeNotification).filter((item): item is NotificationItem => item !== null);
}
