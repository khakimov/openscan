import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { getDb } from '../../database/setup';
import { notifications } from '../../schema/notifications';
import {
  logNotificationsExpired,
  logNotificationsDeleted,
  logDeleteDryRun,
  logBackfillProgress,
  logBackfillStarted,
  logBackfillComplete,
} from '../../notifications/logger';
import { hashMessage } from './dedupe';

export async function expireNotifications(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .update(notifications)
    .set({ isActive: false })
    .where(
      and(
        lt(notifications.suppressUntil, now),
        eq(notifications.isActive, true)
      )
    )
    .returning({ id: notifications.id });

  const count = result.length;
  logNotificationsExpired(count);

  return count;
}

export async function deleteOldNotifications(
  organizationId: string,
  retentionDays = 90,
  options: {
    batchSize?: number;
    dryRun?: boolean;
  } = {}
): Promise<number> {
  const { batchSize = 1000, dryRun = false } = options;
  const db = getDb();
  const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        lt(notifications.createdAt, new Date(cutoffDate))
      )
    );

  if (dryRun) {
    logDeleteDryRun(organizationId, total, retentionDays);
    return total;
  }

  let deletedRows = 0;
  let batches = 0;
  let lastProcessedId: string | null = null;

  while (deletedRows < total) {
    let query = db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          lt(notifications.createdAt, new Date(cutoffDate))
        )
      );

    if (lastProcessedId) {
      query = query.where(gt(notifications.id, lastProcessedId));
    }

    const batch = await query
      .orderBy(notifications.id)
      .limit(batchSize);

    if (batch.length === 0) break;

    const ids = batch.map((row: { id: string }) => row.id);
    await db
      .delete(notifications)
      .where(inArray(notifications.id, ids));

    deletedRows += batch.length;
    lastProcessedId = batch[batch.length - 1].id;
    batches++;

    if (batches % 10 === 0) {
      logBackfillProgress(batches, deletedRows);
    }
  }

  logNotificationsDeleted(organizationId, deletedRows, retentionDays);

  return deletedRows;
}

export async function backfillMessageHashes(options: {
  batchSize?: number;
  dryRun?: boolean;
} = {}): Promise<{
  processedRows: number;
  updatedRows: number;
  batches: number;
  skippedRows: number;
}> {
  const { batchSize = 100, dryRun = false } = options;
  const db = getDb();

  logBackfillStarted(dryRun, batchSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notifications);

  if (dryRun) {
    let needsBackfill = 0;
    let offset = 0;

    while (offset < total) {
      const batch = await db
        .select({
          id: notifications.id,
          title: notifications.title,
          message: notifications.message,
          currentHash: notifications.messageHash,
        })
        .from(notifications)
        .orderBy(notifications.id)
        .limit(batchSize)
        .offset(offset);

      for (const row of batch) {
        const correctHash = hashMessage(row.title, row.message);
        if (row.currentHash !== correctHash) {
          needsBackfill++;
        }
      }

      offset += batchSize;
    }

    const result = {
      processedRows: needsBackfill,
      updatedRows: 0,
      batches: 0,
      skippedRows: total - needsBackfill,
      dryRun: true,
    };
    logBackfillComplete(result);
    return result;
  }

  let updatedRows = 0;
  let batches = 0;
  let lastProcessedId: string | null = null;

  while (true) {
    let query = db
      .select({
        id: notifications.id,
        title: notifications.title,
        message: notifications.message,
        currentHash: notifications.messageHash,
      })
      .from(notifications);

    if (lastProcessedId) {
      query = query.where(gt(notifications.id, lastProcessedId));
    }

    const batch = await query
      .orderBy(notifications.id)
      .limit(batchSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      const correctHash = hashMessage(row.title, row.message);

      if (row.currentHash !== correctHash) {
        await db
          .update(notifications)
          .set({ messageHash: correctHash })
          .where(eq(notifications.id, row.id));

        updatedRows++;
      }

      lastProcessedId = row.id;
    }

    batches++;

    if (batches % 10 === 0) {
      logBackfillProgress(batches, updatedRows);
    }
  }

  const result = {
    processedRows: updatedRows,
    updatedRows,
    batches,
    skippedRows: total - updatedRows,
    dryRun: false,
  };

  logBackfillComplete(result);

  return result;
}
