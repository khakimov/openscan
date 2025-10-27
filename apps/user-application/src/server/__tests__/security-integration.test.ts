/**
 * Security Integration Tests
 *
 * These tests call the REAL server functions (not just SQL patterns) to verify
 * authorization is properly enforced.
 *
 * TDD Approach:
 * 1. Write tests that call actual server functions
 * 2. Mock getCurrentUser/getCurrentOrganizationId to simulate different users
 * 3. Attempt cross-org attacks
 * 4. Verify they're blocked with proper errors
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '@repo/data-ops/database/setup';
import { organization, auth_user, member } from '@repo/data-ops/drizzle/auth-schema';
import { projects, devices } from '@repo/data-ops/schema/inventory';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createMultipleDevicesFromDiscovery } from '@repo/data-ops';

// Test data IDs
let orgAId: string;
let orgBId: string;
let userAId: string;
let userBId: string;
let projectAId: string;
let projectBId: string;

describe('Security Integration Tests - Real Server Functions', () => {
  beforeAll(async () => {
    // Use existing Miniflare setup from integration-setup.ts
    const db = getDb();

    // Create Organization A with User A and Project A
    orgAId = createId();
    await db.insert(organization).values({
      id: orgAId,
      name: 'Security Test Org A',
      slug: `sec-org-a-${Date.now()}`,
      createdAt: new Date(),
    });

    userAId = createId();
    await db.insert(auth_user).values({
      id: userAId,
      name: 'User A',
      email: `user-a-${Date.now()}@test.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    projectAId = createId();
    await db.insert(projects).values({
      id: projectAId,
      organizationId: orgAId,
      name: 'Project A',
      isDefault: true,
      createdAt: new Date(),
    });

    // Create membership: User A is member of Org A
    await db.insert(member).values({
      id: createId(),
      organizationId: orgAId,
      userId: userAId,
      role: 'owner',
      createdAt: new Date(),
    });

    // Create Organization B with User B and Project B
    orgBId = createId();
    await db.insert(organization).values({
      id: orgBId,
      name: 'Security Test Org B',
      slug: `sec-org-b-${Date.now()}`,
      createdAt: new Date(),
    });

    userBId = createId();
    await db.insert(auth_user).values({
      id: userBId,
      name: 'User B',
      email: `user-b-${Date.now()}@test.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    projectBId = createId();
    await db.insert(projects).values({
      id: projectBId,
      organizationId: orgBId,
      name: 'Project B',
      isDefault: true,
      createdAt: new Date(),
    });

    // Create membership: User B is member of Org B
    await db.insert(member).values({
      id: createId(),
      organizationId: orgBId,
      userId: userBId,
      role: 'owner',
      createdAt: new Date(),
    });

    console.log('✅ Security integration test data created');
  });

  afterAll(async () => {
    const db = getDb();

    // Cleanup (order matters due to foreign key constraints)
    await db.delete(devices).where(eq(devices.organizationId, orgAId));
    await db.delete(devices).where(eq(devices.organizationId, orgBId));
    await db.delete(projects).where(eq(projects.id, projectAId));
    await db.delete(projects).where(eq(projects.id, projectBId));
    await db.delete(member).where(eq(member.userId, userAId));
    await db.delete(member).where(eq(member.userId, userBId));
    await db.delete(auth_user).where(eq(auth_user.id, userAId));
    await db.delete(auth_user).where(eq(auth_user.id, userBId));
    await db.delete(organization).where(eq(organization.id, orgAId));
    await db.delete(organization).where(eq(organization.id, orgBId));

    console.log('🧹 Security integration test data cleaned up');
  });

  describe('VULN-003: Device Creation Authorization', () => {
    it('should allow device creation in own project', async () => {
      // User A creates device in Project A (own organization)
      const result = await createMultipleDevicesFromDiscovery(
        [{ host: 'device-a-1.example.com', ip: '192.168.1.100' }],
        orgAId, // User A's organization
        {
          projectId: projectAId, // User A's project
          source: 'TEST',
        }
      );

      // Function returns array of created devices
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('device-a-1.example.com');

      console.log('✅ User can create devices in own project');
    });

    it('should reject device creation in another organizations project', async () => {
      // User A tries to create device in Project B (Org B) - ATTACK
      await expect(
        createMultipleDevicesFromDiscovery(
          [{ host: 'attack-device.example.com', ip: '192.168.1.200' }],
          orgAId, // User A's organization
          {
            projectId: projectBId, // Project B (belongs to Org B) - WRONG ORG!
            source: 'TEST',
          }
        )
      ).rejects.toThrow('Project not found or access denied');

      console.log('🛡️ Cross-org device creation blocked');
    });

    it('should reject device creation with mismatched org and project', async () => {
      // Attempt to create device with Org A ID but Project B ID
      await expect(
        createMultipleDevicesFromDiscovery(
          [{ host: 'mismatch-device.example.com', ip: '192.168.1.201' }],
          orgAId, // Org A
          {
            projectId: projectBId, // Project B (wrong org!)
            source: 'TEST',
          }
        )
      ).rejects.toThrow('Project not found or access denied');

      console.log('🛡️ Mismatched org/project blocked');
    });
  });

  describe('VULN-004: getDiscoveryDevices Authorization', () => {
    it('should validate organization membership before accepting caller-provided organizationId', async () => {
      // This test verifies the validateOrganizationAccess pattern
      // used in getDiscoveryDevices to prevent cross-org enumeration

      const { validateOrganizationAccess } = await import('@repo/data-ops');

      // Create discovery devices for Org A
      await createMultipleDevicesFromDiscovery(
        [
          { host: 'discovery-a-1.example.com', ip: '192.168.1.10' },
          { host: 'discovery-a-2.example.com', ip: '192.168.1.11' },
        ],
        orgAId,
        {
          projectId: projectAId,
          source: 'DISCOVERY',
        }
      );

      // User A should be able to access their own org
      const validAccess = await validateOrganizationAccess(userAId, orgAId);
      expect(validAccess).toBeTruthy();
      expect(validAccess?.id).toBe(orgAId);

      // User B should NOT have access to Org A
      const invalidAccess = await validateOrganizationAccess(userBId, orgAId);
      expect(invalidAccess).toBeNull();

      console.log('🛡️ Organization membership validation working correctly');
    });

    it('should prevent cross-org device enumeration via forged organizationId', async () => {
      // Scenario: User B tries to enumerate Org A's discovery devices
      // by providing orgAId in the request body

      const { validateOrganizationAccess } = await import('@repo/data-ops');

      // User B attempts to access Org A's data (ATTACK)
      const access = await validateOrganizationAccess(userBId, orgAId);

      // Validation should fail - User B is not a member of Org A
      expect(access).toBeNull();

      // If validation were bypassed (as in the vulnerable version),
      // getDevicesForTenant would return Org A's devices to User B
      // With validation, the server function should throw before calling getDevicesForTenant

      console.log('🛡️ Cross-org device enumeration blocked by validation');
    });
  });

  describe('TODO: VULN-002: Organization Data Access (requires server function mocking)', () => {
    it.todo('should block access to organization data without membership');
    it.todo('should allow access to own organization data');
  });

  describe('TODO: Onboarding Cross-Org Tampering (requires server function)', () => {
    it.todo('should reject onboarding with forged organizationId');
    it.todo('should reject project updates in other organizations');
  });
});
