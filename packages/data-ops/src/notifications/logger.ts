/**
 * Notification System Structured Logging
 *
 * Consistent logging with [Notifications] prefix for easy grepping.
 * Provides structured data for log aggregation and debugging.
 */

import { createLogger } from '@repo/logger';
import type { notifications } from '../schema/notifications';

const logger = createLogger({ name: 'notifications' });

/**
 * Log successful notification creation
 */
export function logNotificationCreated(notification: typeof notifications.$inferSelect): void {
  logger.info('[Notifications] Created', {
    id: notification.id,
    type: notification.type,
    severity: notification.severity,
    title: notification.title,
    deviceId: notification.deviceId,
    scanRunId: notification.scanRunId,
    organizationId: notification.organizationId,
    fingerprint: notification.fingerprint,
  });
}

/**
 * Log notification suppression (duplicate detected)
 */
export function logNotificationSuppressed(
  fingerprint: string,
  reason: string,
  context?: Record<string, any>
): void {
  logger.info('[Notifications] Suppressed', {
    fingerprint,
    reason,
    ...context,
  });
}

/**
 * Log suppress window extension (upsert conflict)
 */
export function logSuppressWindowExtended(
  fingerprint: string,
  organizationId: string,
  newSuppressUntil: Date
): void {
  logger.info('[Notifications] Suppress window extended', {
    fingerprint,
    organizationId,
    newSuppressUntil: newSuppressUntil.toISOString(),
  });
}

/**
 * Log notification error
 *
 * Preserves original error object properties (code, message, stack) for debugging.
 * SQLite errors may not be Error instances, so we log the raw error directly.
 */
export function logNotificationError(
  error: unknown,
  context: Record<string, any>
): void {
  const errorDetails: Record<string, any> = {};

  // Handle Error instances
  if (error instanceof Error) {
    errorDetails.message = error.message;
    errorDetails.stack = error.stack;
    errorDetails.name = error.name;
  } else if (typeof error === 'object' && error !== null) {
    // Handle plain objects (SQLite errors)
    Object.assign(errorDetails, error);
  } else {
    // Handle primitive types (strings, numbers, etc.)
    errorDetails.value = String(error);
  }

  // Preserve SQLite error code if present (e.g., SQLITE_CONSTRAINT_UNIQUE)
  if (error && typeof error === 'object' && 'code' in error && error.code) {
    errorDetails.code = error.code;
  }

  // Preserve any other enumerable properties (like .errno, .syscall for system errors)
  if (error && typeof error === 'object') {
    for (const key of Object.keys(error)) {
      if (!errorDetails[key]) {
        errorDetails[key] = (error as any)[key];
      }
    }
  }

  logger.error('[Notifications] Error', {
    error: errorDetails,
    ...context,
  });
}

/**
 * Log batch processing summary
 *
 * Metrics:
 * - total: Number of notifications attempted
 * - processed: Number of successful upserts (includes both new and duplicates)
 * - newCount: Number of genuinely new notifications created (excludes duplicates)
 * - suppressed: Number of duplicate notifications that extended suppress window
 * - errors: Number of failures
 */
export function logBatchComplete(stats: {
  total: number;
  processed: number;
  newCount: number;
  suppressed: number;
  errors: number;
}): void {
  logger.info('[Notifications] Batch complete', stats);

  // Warn if high suppression rate
  if (stats.suppressed > 10 && stats.total > 0) {
    const suppressionRate = (stats.suppressed / stats.total * 100).toFixed(1);
    logger.warn('[Notifications] High suppression rate', {
      suppressionRate: `${suppressionRate}%`,
      suppressed: stats.suppressed,
      total: stats.total,
    });
  }
}

/**
 * Log notification expiration (cleanup job)
 */
export function logNotificationsExpired(count: number): void {
  if (count > 0) {
    logger.info('[Notifications] Expired notifications', {
      count,
      reason: 'suppress_until expired',
    });
  } else {
    logger.debug('[Notifications] No notifications to expire');
  }
}

/**
 * Log old notification deletion (cleanup job)
 */
export function logNotificationsDeleted(
  organizationId: string,
  count: number,
  retentionDays: number
): void {
  if (count > 0) {
    logger.info('[Notifications] Deleted old notifications', {
      organizationId,
      count,
      retentionDays,
    });
  } else {
    logger.debug('[Notifications] No old notifications to delete', {
      organizationId,
      retentionDays,
    });
  }
}

/**
 * Log dry-run deletion estimate
 */
export function logDeleteDryRun(
  organizationId: string,
  count: number,
  retentionDays: number
): void {
  logger.info('[Notifications] Dry run - would delete old notifications', {
    organizationId,
    count,
    retentionDays,
    dryRun: true,
  });
}

/**
 * Log backfill operation start
 */
export function logBackfillStarted(dryRun: boolean, batchSize: number): void {
  logger.info('[Notifications] Backfill started', {
    dryRun,
    batchSize,
    target: 'message_hash',
  });
}

/**
 * Log backfill operation complete
 */
export function logBackfillComplete(stats: {
  processedRows: number;
  updatedRows: number;
  batches: number;
  skippedRows: number;
  dryRun: boolean;
}): void {
  logger.info('[Notifications] Backfill complete', stats);

  // Warn if large number of rows need backfill
  if (!stats.dryRun && stats.updatedRows > 1000) {
    logger.warn('[Notifications] Large backfill operation completed', {
      updatedRows: stats.updatedRows,
      batches: stats.batches,
    });
  }
}

/**
 * Log backfill progress (every N batches)
 */
export function logBackfillProgress(
  batches: number,
  updatedRows: number
): void {
  logger.debug('[Notifications] Backfill progress', {
    batches,
    updatedRows,
  });
}
