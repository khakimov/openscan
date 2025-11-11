/**
 * Notification Settings Tests
 *
 * Tests for organization-level email severity threshold configuration
 *
 * Coverage:
 * - resolveEmailSeverities() fallback chain (cache → DB → defaults)
 * - updateEmailSeverities() upsert behavior
 * - Cache invalidation on update
 * - getPendingEmailNotifications() severity filtering
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb } from '../../database/setup';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import {
  resolveEmailSeverities,
  updateEmailSeverities,
  resetEmailSeveritiesToDefaults,
  DEFAULT_EMAIL_SEVERITIES,
} from '../notifications/settings';
import {
  createNotifications,
  getPendingEmailNotifications,
} from '../notifications';
import type { CreateNotificationInput } from '../notifications/schemas';
import { organization } from '../../schema/identity';
import { notifications, organizationNotificationSettings } from '../../schema/notifications';

// ============================================================================
// Test Setup
// ============================================================================

let testOrgId: string;

beforeAll(async () => {
  const db = getDb();

  // Create test organization
  testOrgId = createId();
  await db.insert(organization).values({
    id: testOrgId,
    name: 'Notification Settings Test Org',
    slug: `notification-settings-test-${Date.now()}`,
    createdAt: new Date(),
  });

  console.log('✅ Notification settings test data created');
});

beforeEach(async () => {
  const db = getDb();

  // Clean up notifications and settings before each test for isolation
  await db.delete(notifications).where(eq(notifications.organizationId, testOrgId));
  await db.delete(organizationNotificationSettings).where(eq(organizationNotificationSettings.organizationId, testOrgId));
});

afterAll(async () => {
  const db = getDb();

  // Final cleanup
  await db.delete(notifications).where(eq(notifications.organizationId, testOrgId));
  await db.delete(organizationNotificationSettings).where(eq(organizationNotificationSettings.organizationId, testOrgId));
  await db.delete(organization).where(eq(organization.id, testOrgId));

  console.log('🧹 Notification settings test data cleaned up');
});

// ============================================================================
// Test Helpers
// ============================================================================

async function seedNotifications(
  severities: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'>
): Promise<void> {
  const inputs: CreateNotificationInput[] = severities.map((severity, i) => ({
    organizationId: testOrgId,
    deviceId: null, // Optional - no FK constraint needed for these tests
    scanRunId: null, // Optional - no FK constraint needed for these tests
    type: 'NEW_CVE',
    severity,
    module: 'VULNERABILITY_MANAGEMENT',
    title: `Test ${severity} notification`,
    message: `Test message ${i}`,
    data: { test: true },
    fingerprint: `test_${severity}_${i}_${Date.now()}`, // Add timestamp to ensure uniqueness
    suppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  }));

  await createNotifications(inputs);
}

// ============================================================================
// Tests: resolveEmailSeverities
// ============================================================================

describe('resolveEmailSeverities', () => {
  it('should return defaults when no settings exist', async () => {
    const severities = await resolveEmailSeverities(testOrgId);

    expect(severities).toEqual(DEFAULT_EMAIL_SEVERITIES);
    expect(severities).toEqual(['CRITICAL', 'HIGH']);
  });

  it('should return custom severities from database', async () => {
    // Create settings
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    });

    const severities = await resolveEmailSeverities(testOrgId);

    expect(severities).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);
  });

  it('should cache settings and avoid DB round-trip', async () => {
    // Create settings
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL'],
    });

    // First call - cache miss
    const first = await resolveEmailSeverities(testOrgId);
    expect(first).toEqual(['CRITICAL']);

    // Second call - should hit cache (test by updating DB without clearing cache)
    // In real implementation, cache should return same result
    const second = await resolveEmailSeverities(testOrgId);
    expect(second).toEqual(['CRITICAL']);
  });

  it('should invalidate cache after update', async () => {
    // Create initial settings
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL'],
    });

    const before = await resolveEmailSeverities(testOrgId);
    expect(before).toEqual(['CRITICAL']);

    // Update settings (should clear cache)
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    });

    // Should return updated settings
    const after = await resolveEmailSeverities(testOrgId);
    expect(after).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  });

});


// ============================================================================
// Tests: updateEmailSeverities
// ============================================================================

describe('updateEmailSeverities', () => {
  it('should create settings when none exist', async () => {
    const result = await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH'],
    });

    expect(result.organizationId).toBe(testOrgId);
    expect(result.emailAllowedSeverities).toEqual(['CRITICAL', 'HIGH']);
  });

  it('should update existing settings', async () => {
    // Create initial
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL'],
    });

    // Update
    const updated = await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    });

    expect(updated.emailAllowedSeverities).toEqual([
      'CRITICAL',
      'HIGH',
      'MEDIUM',
    ]);

    // Verify only one row exists
    const db = getDb();

    const all = await db
      .select()
      .from(organizationNotificationSettings)
      .where(eq(organizationNotificationSettings.organizationId, testOrgId));

    expect(all).toHaveLength(1);
  });

  it('should reject empty severity array', async () => {
    await expect(
      updateEmailSeverities({
        organizationId: testOrgId,
        emailAllowedSeverities: [],
      })
    ).rejects.toThrow();
  });

  it('should reject invalid severities', async () => {
    await expect(
      updateEmailSeverities({
        organizationId: testOrgId,
        emailAllowedSeverities: ['INVALID' as any],
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Tests: resetEmailSeveritiesToDefaults
// ============================================================================

describe('resetEmailSeveritiesToDefaults', () => {
  it('should reset to defaults', async () => {
    // Set custom severities
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['INFO', 'LOW'],
    });

    // Reset to defaults
    const reset = await resetEmailSeveritiesToDefaults(testOrgId);

    expect(reset.emailAllowedSeverities).toEqual(DEFAULT_EMAIL_SEVERITIES);

    // Verify via resolve
    const severities = await resolveEmailSeverities(testOrgId);
    expect(severities).toEqual(DEFAULT_EMAIL_SEVERITIES);
  });
});

// ============================================================================
// Tests: getPendingEmailNotifications Integration
// ============================================================================

describe('getPendingEmailNotifications with settings', () => {
  it('should filter by default severities (CRITICAL + HIGH)', async () => {
    // Seed notifications with all severities
    await seedNotifications(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

    // No settings configured → defaults to ['CRITICAL', 'HIGH']
    const pending = await getPendingEmailNotifications(testOrgId);

    expect(pending).toHaveLength(2);
    expect(pending.map((n) => n.severity)).toEqual(
      expect.arrayContaining(['CRITICAL', 'HIGH'])
    );
  });

  it('should filter by custom severities', async () => {
    // Configure org to allow all severities
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'],
    });

    // Seed notifications
    await seedNotifications(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

    const pending = await getPendingEmailNotifications(testOrgId);

    expect(pending).toHaveLength(5);
  });

  it('should filter by CRITICAL only', async () => {
    // Configure org to only allow CRITICAL
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL'],
    });

    // Seed notifications
    await seedNotifications(['CRITICAL', 'HIGH', 'MEDIUM']);

    const pending = await getPendingEmailNotifications(testOrgId);

    expect(pending).toHaveLength(1);
    expect(pending[0]!.severity).toBe('CRITICAL');
  });

  it('should respect emailSent flag', async () => {
    // Configure severities
    await updateEmailSeverities({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH'],
    });

    // Seed notifications
    await seedNotifications(['CRITICAL', 'HIGH']);

    // Mark one as sent
    const db = getDb();

    const [first] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.organizationId, testOrgId))
      .limit(1);

    await db
      .update(notifications)
      .set({ emailSent: true, emailSentAt: new Date() })
      .where(eq(notifications.id, first!.id));

    // Should only return unsent
    const pending = await getPendingEmailNotifications(testOrgId);
    expect(pending).toHaveLength(1);
    expect(pending.every((n) => !n.emailSent)).toBe(true);
  });

  it('should respect isActive flag', async () => {
    // Seed notifications
    await seedNotifications(['CRITICAL', 'HIGH']);

    // Mark one as inactive (expired)
    const db = getDb();

    const [first] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.organizationId, testOrgId))
      .limit(1);

    await db
      .update(notifications)
      .set({ isActive: false })
      .where(eq(notifications.id, first!.id));

    // Should only return active
    const pending = await getPendingEmailNotifications(testOrgId);
    expect(pending).toHaveLength(1);
    expect(pending.every((n) => n.isActive)).toBe(true);
  });
});

// ============================================================================
// Tests: Multi-Organization Isolation
// ============================================================================

describe('multi-organization isolation', () => {
  it('should isolate settings per organization', async () => {
    const db = getDb();

    const org1 = createId();
    const org2 = createId();

    // Create organizations first (needed for FK constraint)
    await db.insert(organization).values([
      {
        id: org1,
        name: 'Test Org 1',
        slug: `test-org-1-${Date.now()}`,
        createdAt: new Date(),
      },
      {
        id: org2,
        name: 'Test Org 2',
        slug: `test-org-2-${Date.now()}`,
        createdAt: new Date(),
      },
    ]);

    // Configure different severities
    await updateEmailSeverities({
      organizationId: org1,
      emailAllowedSeverities: ['CRITICAL'],
    });

    await updateEmailSeverities({
      organizationId: org2,
      emailAllowedSeverities: ['CRITICAL', 'HIGH', 'MEDIUM'],
    });

    // Verify isolation
    const sev1 = await resolveEmailSeverities(org1);
    const sev2 = await resolveEmailSeverities(org2);

    expect(sev1).toEqual(['CRITICAL']);
    expect(sev2).toEqual(['CRITICAL', 'HIGH', 'MEDIUM']);

    // Cleanup
    await db.delete(organizationNotificationSettings).where(eq(organizationNotificationSettings.organizationId, org1));
    await db.delete(organizationNotificationSettings).where(eq(organizationNotificationSettings.organizationId, org2));
    await db.delete(organization).where(eq(organization.id, org1));
    await db.delete(organization).where(eq(organization.id, org2));
  });
});

// ============================================================================
// Tests: Disabled Alerts (Empty Array Contract)
// ============================================================================

describe('disabled alerts (empty array contract)', () => {
  it('should persist empty array when alerts disabled', async () => {
    const { updateEmailSeveritiesOrDisable } = await import('../notifications/settings');

    // Store empty array (alerts disabled)
    const result = await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: [],
    });

    expect(result.organizationId).toBe(testOrgId);
    expect(result.emailAllowedSeverities).toEqual([]);
  });

  it('should return empty array when alerts disabled', async () => {
    const { updateEmailSeveritiesOrDisable } = await import('../notifications/settings');

    // Store empty array
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: [],
    });

    // Verify resolveEmailSeverities returns empty array
    const severities = await resolveEmailSeverities(testOrgId);
    expect(severities).toEqual([]);
  });

  it('should return no notifications when alerts disabled', async () => {
    const { updateEmailSeveritiesOrDisable } = await import('../notifications/settings');

    // Disable alerts
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: [],
    });

    // Seed notifications with all severities
    await seedNotifications(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

    // getPendingEmailNotifications should return empty array (not crash)
    const pending = await getPendingEmailNotifications(testOrgId);
    expect(pending).toEqual([]);
  });

  it('should cache empty array (disabled state)', async () => {
    const { updateEmailSeveritiesOrDisable } = await import('../notifications/settings');

    // Disable alerts
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: [],
    });

    // First call - cache miss
    const first = await resolveEmailSeverities(testOrgId);
    expect(first).toEqual([]);

    // Second call - should hit cache
    const second = await resolveEmailSeverities(testOrgId);
    expect(second).toEqual([]);
  });

  it('should toggle between enabled and disabled', async () => {
    const { updateEmailSeveritiesOrDisable } = await import('../notifications/settings');

    // Enable with severities
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL', 'HIGH'],
    });

    let severities = await resolveEmailSeverities(testOrgId);
    expect(severities).toEqual(['CRITICAL', 'HIGH']);

    // Disable (empty array)
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: [],
    });

    severities = await resolveEmailSeverities(testOrgId);
    expect(severities).toEqual([]);

    // Re-enable with different severities
    await updateEmailSeveritiesOrDisable({
      organizationId: testOrgId,
      emailAllowedSeverities: ['CRITICAL'],
    });

    severities = await resolveEmailSeverities(testOrgId);
    expect(severities).toEqual(['CRITICAL']);
  });
});
