import { and, eq, gt } from 'drizzle-orm';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { getDb } from '../../database/setup';
import { notifications } from '../../schema/notifications';

export function hashMessage(title: string, message?: string | null): string {
  const content = `${title}|${message || ''}`;
  const hashBytes = sha256(new TextEncoder().encode(content));
  return bytesToHex(hashBytes);
}

export async function checkDuplicateNotification(
  fingerprint: string,
  organizationId: string
): Promise<typeof notifications.$inferSelect | null> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.fingerprint, fingerprint),
        gt(notifications.suppressUntil, now),
        eq(notifications.isActive, true)
      )
    )
    .limit(1);

  return existing || null;
}
