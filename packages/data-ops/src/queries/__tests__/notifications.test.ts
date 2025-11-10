import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../../database/setup';
import { upsertNotification, hashMessage, type CreateNotificationInput } from '../notifications';
import { notifications } from '../../schema/notifications';
import { organization } from '../../schema/identity';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

/**
 * D1 Concurrency Tests for Phase 2
 *
 * Tests upsertNotification with onConflictDoUpdate under parallel load.
 * Verifies:
 * - No duplicate notifications (partial unique index enforced)
 * - Atomic upsert behavior
 * - Suppress window extension on conflict
 *
 * See: docs/D1_COMPATIBILITY_VERIFICATION.md
 */

describe('Notifications - D1 Concurrency (Phase 2)', () => {
  let orgId: string;

  beforeAll(async () => {
    const db = getDb();

    // Create test organization
    orgId = createId();
    await db.insert(organization).values({
      id: orgId,
      name: 'Notifications Test Org',
      slug: `notifications-test-${Date.now()}`,
      createdAt: new Date(),
    });

    console.log('✅ Notifications test data created');
  });

  afterAll(async () => {
    const db = getDb();

    // Cleanup
    await db.delete(notifications).where(eq(notifications.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));

    console.log('🧹 Notifications test data cleaned up');
  });

  describe('upsertNotification - Concurrency', () => {
    it('should handle concurrent upserts correctly (no duplicates)', async () => {
      const fingerprint = `new_port:${createId()}:22:tcp`;

      const baseInput: CreateNotificationInput = {
        organizationId: orgId,
        // deviceId omitted - optional field, no need for FK constraint in this test
        type: 'NEW_PORT',
        severity: 'HIGH',
        module: 'NETWORK_SECURITY',
        title: 'New SSH service on port 22',
        message: 'OpenSSH 8.9 detected',
        fingerprint,
        suppressUntil: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
      };

      // Simulate 10 concurrent workers trying to upsert same notification
      const promises = Array.from({ length: 10 }, (_, i) =>
        upsertNotification({
          ...baseInput,
          title: `Attempt ${i}`, // Different title to vary messageHash
        })
      );

      const results = await Promise.all(promises);
      const db = getDb();

      // All should succeed (no errors thrown)
      expect(results.every((r) => r !== null)).toBe(true);

      // Database should have exactly 1 row (onConflictDoUpdate prevents duplicates)
      const rows = await db.select().from(notifications).where(eq(notifications.fingerprint, fingerprint));
      expect(rows).toHaveLength(1);

      // Verify the row has the latest title (last upsert wins)
      expect(rows[0].title).toBe('Attempt 9');
    });

    it('should extend suppress window on conflict', async () => {
      const fingerprint = `new_port:${createId()}:80:tcp`;
      const db = getDb();

      // First insert with 1 hour suppress window
      const firstSuppressUntil = new Date(Date.now() + 1 * 60 * 60 * 1000);
      await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'MEDIUM',
        module: 'NETWORK_SECURITY',
        title: 'First notification',
        fingerprint,
        suppressUntil: firstSuppressUntil,
      });

      // Second upsert with 6 hour suppress window (should extend)
      const secondSuppressUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
      await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'MEDIUM',
        module: 'NETWORK_SECURITY',
        title: 'Second notification',
        fingerprint,
        suppressUntil: secondSuppressUntil,
      });

      // Database should have exactly 1 row
      const rows = await db.select().from(notifications).where(eq(notifications.fingerprint, fingerprint));
      expect(rows).toHaveLength(1);

      // Suppress window should be extended to second value
      expect(new Date(rows[0].suppressUntil).getTime()).toBeGreaterThan(firstSuppressUntil.getTime());
    });

    it('should allow fingerprint reuse after suppress window expires', async () => {
      const fingerprint = `new_port:${createId()}:443:tcp`;
      const now = Date.now();
      const db = getDb();

      // First notification with expired suppress window
      const firstResult = await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'LOW',
        module: 'NETWORK_SECURITY',
        title: 'Expired notification',
        fingerprint,
        suppressUntil: new Date(now - 1000), // Already expired
      });

      const firstId = firstResult!.notification.id;

      // Second notification with same fingerprint (future suppress window)
      // upsertNotification automatically expires stale rows (see notifications.ts:215-228)
      // The partial unique index (WHERE is_active = 1) allows multiple inactive rows
      const secondResult = await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'HIGH',
        module: 'NETWORK_SECURITY',
        title: 'New notification',
        fingerprint,
        suppressUntil: new Date(now + 6 * 60 * 60 * 1000),
      });

      const secondId = secondResult!.notification.id;

      // Partial unique index allows fresh row insertion after expiry
      const rows = await db.select().from(notifications).where(eq(notifications.fingerprint, fingerprint));
      expect(rows).toHaveLength(2); // One expired, one active

      // Verify first notification is now inactive (expired by manual expiry)
      const expiredRow = rows.find(r => r.id === firstId);
      expect(expiredRow?.isActive).toBe(false);
      expect(expiredRow?.title).toBe('Expired notification');

      // Verify second notification is a NEW row with fresh ID and is active
      const activeRow = rows.find(r => r.id === secondId);
      expect(activeRow?.isActive).toBe(true);
      expect(activeRow?.title).toBe('New notification');
      expect(activeRow?.severity).toBe('HIGH');
      expect(secondId).not.toBe(firstId); // Different IDs = different rows
    });

    it('should allow 3+ notification cycles (regression test for partial index)', async () => {
      // Critical regression test: Verifies partial index allows multiple inactive rows
      // A composite index on (org_id, fingerprint, is_active) would fail on the second expiry
      const fingerprint = `new_port:${createId()}:8080:tcp`;
      const now = Date.now();
      const db = getDb();

      // Cycle 1: Create and expire first notification
      const first = await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'LOW',
        module: 'NETWORK_SECURITY',
        title: 'First notification',
        fingerprint,
        suppressUntil: new Date(now - 1000), // Expired
      });

      // Cycle 2: Create and expire second notification
      const second = await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'MEDIUM',
        module: 'NETWORK_SECURITY',
        title: 'Second notification',
        fingerprint,
        suppressUntil: new Date(now - 500), // Expired
      });

      // Cycle 3: Create third notification (still active)
      const third = await upsertNotification({
        organizationId: orgId,
        type: 'NEW_PORT',
        severity: 'HIGH',
        module: 'NETWORK_SECURITY',
        title: 'Third notification',
        fingerprint,
        suppressUntil: new Date(now + 6 * 60 * 60 * 1000), // Future
      });

      // Verify all 3 rows exist
      const rows = await db.select().from(notifications)
        .where(eq(notifications.fingerprint, fingerprint))
        .orderBy(notifications.createdAt);

      expect(rows).toHaveLength(3);

      // Verify first two are inactive (different IDs = different rows, not updates)
      expect(rows[0].isActive).toBe(false);
      expect(rows[0].title).toBe('First notification');
      expect(rows[0].id).toBe(first!.notification.id);

      expect(rows[1].isActive).toBe(false);
      expect(rows[1].title).toBe('Second notification');
      expect(rows[1].id).toBe(second!.notification.id);

      // Verify third is active
      expect(rows[2].isActive).toBe(true);
      expect(rows[2].title).toBe('Third notification');
      expect(rows[2].id).toBe(third!.notification.id);

      // Verify all have different IDs (fresh inserts, not updates)
      const ids = rows.map(r => r.id);
      expect(new Set(ids).size).toBe(3); // 3 unique IDs
    });
  });

  describe('hashMessage - Helper', () => {
    it('should generate full 64-char SHA-256 hash', () => {
      const hash = hashMessage('Test title', 'Test message');

      // Full SHA-256 digest is 64 hex characters
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for same input', () => {
      const hash1 = hashMessage('Same title', 'Same message');
      const hash2 = hashMessage('Same title', 'Same message');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashMessage('Title 1', 'Message 1');
      const hash2 = hashMessage('Title 2', 'Message 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle null message gracefully', () => {
      const hash1 = hashMessage('Title only', null);
      const hash2 = hashMessage('Title only', undefined);
      const hash3 = hashMessage('Title only', '');

      // All null/undefined/empty should produce same hash
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });
});
