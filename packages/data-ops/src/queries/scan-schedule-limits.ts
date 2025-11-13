import { eq, and, lte, count as drizzleCount } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { scanScheduleLeases } from '../schema/orchestration';
import { createId } from '@paralleldrive/cuid2';

/**
 * Custom error for concurrency limit exceeded
 */
export class ConcurrencyLimitError extends Error {
  constructor(
    public readonly details: {
      organizationId: string;
      limit: number;
      current: number;
    }
  ) {
    super(
      `Concurrent scan limit exceeded for org ${details.organizationId}: ${details.current}/${details.limit}`
    );
    this.name = 'ConcurrencyLimitError';
  }
}

/**
 * Configuration: Max concurrent scans per organization
 * TODO: Make this configurable per organization tier
 */
const MAX_CONCURRENT_SCANS_PER_ORG = 5;

/**
 * Lease TTL: 30 minutes (extended on heartbeat if scan runs longer)
 */
const LEASE_TTL_MS = 30 * 60 * 1000;

/**
 * Acquire a scan slot for the organization
 * Throws ConcurrencyLimitError if limit is reached
 */
export async function acquireScanSlot(input: {
  organizationId: string;
  scheduleId: string;
  deviceId: string;
  preset: 'QUICK' | 'STANDARD' | 'THOROUGH';
}): Promise<{ leaseId: string }> {
  const db = getDb();

  // Note: D1 doesn't support traditional transactions in Workers runtime
  // We use optimistic concurrency with cleanup + count + insert pattern
  // Race conditions are acceptable here (worst case: slightly exceed limit temporarily)

  // 1. Clean up expired leases proactively
  await db
    .delete(scanScheduleLeases)
    .where(lte(scanScheduleLeases.expiresAt, new Date()));

  // 2. Count active leases for this organization
  const [result] = await db
    .select({ count: drizzleCount() })
    .from(scanScheduleLeases)
    .where(eq(scanScheduleLeases.organizationId, input.organizationId));

  const activeCount = Number(result?.count ?? 0);

  // 3. Check if limit reached
  if (activeCount >= MAX_CONCURRENT_SCANS_PER_ORG) {
    throw new ConcurrencyLimitError({
      organizationId: input.organizationId,
      limit: MAX_CONCURRENT_SCANS_PER_ORG,
      current: activeCount,
    });
  }

  // 4. Create lease
  const leaseId = createId();
  const expiresAt = new Date(Date.now() + LEASE_TTL_MS);

  await db.insert(scanScheduleLeases).values({
    id: createId(),
    leaseId,
    organizationId: input.organizationId,
    scheduleId: input.scheduleId,
    deviceId: input.deviceId,
    preset: input.preset,
    acquiredAt: new Date(),
    expiresAt,
  });

  return { leaseId };
}

/**
 * Release a scan slot
 */
export async function releaseScanSlot(input: {
  leaseId: string;
  organizationId: string;
}): Promise<void> {
  const db = getDb();

  await db
    .delete(scanScheduleLeases)
    .where(
      and(
        eq(scanScheduleLeases.leaseId, input.leaseId),
        eq(scanScheduleLeases.organizationId, input.organizationId)
      )
    );
}

/**
 * Extend lease expiration (heartbeat mechanism for long-running scans)
 */
export async function extendScanLease(
  leaseId: string,
  extensionMs: number = LEASE_TTL_MS
): Promise<void> {
  const db = getDb();

  const newExpiresAt = new Date(Date.now() + extensionMs);

  await db
    .update(scanScheduleLeases)
    .set({ expiresAt: newExpiresAt })
    .where(eq(scanScheduleLeases.leaseId, leaseId));
}

/**
 * Clean up expired leases (run periodically via cron)
 */
export async function cleanupExpiredLeases(): Promise<number> {
  const db = getDb();

  const result = await db
    .delete(scanScheduleLeases)
    .where(lte(scanScheduleLeases.expiresAt, new Date()))
    .returning({ leaseId: scanScheduleLeases.leaseId });

  return result.length;
}

/**
 * Get active lease count for an organization (for monitoring)
 */
export async function getActiveLeasesCount(
  organizationId: string
): Promise<number> {
  const db = getDb();

  // Clean up expired first
  await db
    .delete(scanScheduleLeases)
    .where(lte(scanScheduleLeases.expiresAt, new Date()));

  const [result] = await db
    .select({ count: drizzleCount() })
    .from(scanScheduleLeases)
    .where(eq(scanScheduleLeases.organizationId, organizationId));

  return Number(result?.count ?? 0);
}

/**
 * Get all active leases (for observability dashboard)
 */
export async function getActiveLeasesByOrganization(): Promise<
  Array<{ organizationId: string; active: number }>
> {
  const db = getDb();

  // Clean up expired first
  await db
    .delete(scanScheduleLeases)
    .where(lte(scanScheduleLeases.expiresAt, new Date()));

  const rows = await db
    .select({
      organizationId: scanScheduleLeases.organizationId,
      active: drizzleCount(),
    })
    .from(scanScheduleLeases)
    .groupBy(scanScheduleLeases.organizationId);

  return rows.map((row: any) => ({
    organizationId: row.organizationId,
    active: Number(row.active),
  }));
}
