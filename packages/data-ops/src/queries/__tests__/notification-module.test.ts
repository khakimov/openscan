import { describe, it, expect } from 'vitest';
import { CreateNotificationSchema } from '../notifications';

/**
 * Unit test to verify module field is required in notification schema
 *
 * This test validates the sec-xp0 fix without requiring database migrations.
 */
describe('Notification Module Field (sec-xp0)', () => {
  it('should require module field in CreateNotificationInput', () => {
    // Valid notification with module
    const validNotification = {
      organizationId: 'org_123',
      type: 'NEW_PORT',
      severity: 'HIGH',
      module: 'NETWORK_SECURITY',
      title: 'Test notification',
      fingerprint: 'test_fingerprint',
      suppressUntil: new Date(),
    };

    const result = CreateNotificationSchema.safeParse(validNotification);
    expect(result.success).toBe(true);
  });

  it('should reject notification without module field', () => {
    // Missing module field
    const invalidNotification = {
      organizationId: 'org_123',
      type: 'NEW_PORT',
      severity: 'HIGH',
      // module missing!
      title: 'Test notification',
      fingerprint: 'test_fingerprint',
      suppressUntil: new Date(),
    };

    const result = CreateNotificationSchema.safeParse(invalidNotification);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('module');
    }
  });

  it('should only accept valid module values', () => {
    const validModules = ['NETWORK_SECURITY', 'VULNERABILITY_MANAGEMENT', 'GENERAL'];

    for (const module of validModules) {
      const notification = {
        organizationId: 'org_123',
        type: 'NEW_PORT',
        severity: 'HIGH',
        module,
        title: 'Test',
        fingerprint: 'test',
        suppressUntil: new Date(),
      };

      const result = CreateNotificationSchema.safeParse(notification);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid module values', () => {
    const notification = {
      organizationId: 'org_123',
      type: 'NEW_PORT',
      severity: 'HIGH',
      module: 'INVALID_MODULE',
      title: 'Test',
      fingerprint: 'test',
      suppressUntil: new Date(),
    };

    const result = CreateNotificationSchema.safeParse(notification);
    expect(result.success).toBe(false);
  });
});
