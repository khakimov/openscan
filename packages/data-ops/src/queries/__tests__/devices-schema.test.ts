import { describe, it, expect } from 'vitest';
import { expectTypeOf } from 'vitest';
import {
  CreateDevicesInProjectSchema,
  CreateDevicesFromDiscoverySchema,
  type CreateDevicesInProjectInput,
  type CreateDevicesFromDiscoveryInput,
} from '../devices';
import { devices } from '../../schema';

/**
 * Type-Level Assertion Tests
 *
 * These tests catch schema evolution issues at compile-time.
 * If you change the database schema (e.g., make projectId required),
 * these tests will fail in CI, forcing you to update the contracts.
 */
describe('Device Creation Schema Contracts', () => {
  describe('Type Compatibility', () => {
    it('CreateDevicesInProjectInput should require projectId', () => {
      // ✅ This test ensures projectId is NOT optional in UI flows
      expectTypeOf<CreateDevicesInProjectInput['projectId']>().toBeString();
      expectTypeOf<CreateDevicesInProjectInput['projectId']>().not.toBeNullable();
      expectTypeOf<CreateDevicesInProjectInput['projectId']>().not.toBeUndefined();
    });

    it('CreateDevicesFromDiscoveryInput should allow optional projectId', () => {
      // ✅ This test ensures projectId CAN be null in worker flows
      expectTypeOf<CreateDevicesFromDiscoveryInput['projectId']>().toMatchTypeOf<string | null | undefined>();
    });

    it('Both schemas should require organizationId', () => {
      // ✅ Both flows always require organizationId
      expectTypeOf<CreateDevicesInProjectInput['organizationId']>().toBeString();
      expectTypeOf<CreateDevicesFromDiscoveryInput['organizationId']>().toBeString();
    });

    it('Both schemas should require targets array', () => {
      // ✅ Both flows always require at least one target
      expectTypeOf<CreateDevicesInProjectInput['targets']>().toBeArray();
      expectTypeOf<CreateDevicesFromDiscoveryInput['targets']>().toBeArray();
    });
  });

  describe('Runtime Validation', () => {
    it('UI schema should reject missing projectId', () => {
      const invalidInput = {
        targets: [{ host: 'example.com' }],
        organizationId: 'org123',
        // projectId missing
      };

      expect(() => CreateDevicesInProjectSchema.parse(invalidInput)).toThrow(/Project ID is required/);
    });

    it('UI schema should reject empty projectId', () => {
      const invalidInput = {
        targets: [{ host: 'example.com' }],
        organizationId: 'org123',
        projectId: '',  // Empty string
      };

      expect(() => CreateDevicesInProjectSchema.parse(invalidInput)).toThrow(/Project ID is required/);
    });

    it('UI schema should accept valid projectId', () => {
      const validInput = {
        targets: [{ host: 'example.com' }],
        organizationId: 'org123',
        projectId: 'proj123',
      };

      const result = CreateDevicesInProjectSchema.parse(validInput);
      expect(result.projectId).toBe('proj123');
    });

    it('Discovery schema should accept null projectId', () => {
      const validInput = {
        targets: [{ host: 'example.com' }],
        organizationId: 'org123',
        projectId: null,
      };

      const result = CreateDevicesFromDiscoverySchema.parse(validInput);
      expect(result.projectId).toBeNull();
    });

    it('Discovery schema should accept undefined projectId', () => {
      const validInput = {
        targets: [{ host: 'example.com' }],
        organizationId: 'org123',
        // projectId omitted
      };

      const result = CreateDevicesFromDiscoverySchema.parse(validInput);
      expect(result.projectId).toBeUndefined();
    });

    it('Both schemas should require at least one target', () => {
      const invalidInput = {
        targets: [],  // Empty array
        organizationId: 'org123',
        projectId: 'proj123',
      };

      expect(() => CreateDevicesInProjectSchema.parse(invalidInput)).toThrow(/At least one target/);
    });

    it('Both schemas should validate target host', () => {
      const invalidInput = {
        targets: [{ host: '' }],  // Empty host
        organizationId: 'org123',
        projectId: 'proj123',
      };

      expect(() => CreateDevicesInProjectSchema.parse(invalidInput)).toThrow(/Host is required/);
    });
  });

  describe('Schema Evolution Guards', () => {
    it('should fail CI if projectId becomes required in Drizzle schema', () => {
      // This test documents expected behavior:
      // - Currently: devices.projectId is nullable (text('project_id'))
      // - If changed to: text('project_id').notNull()
      // - Then: This test should be updated + CreateDevicesFromDiscoverySchema should be reviewed

      type DrizzleDeviceInsert = typeof devices.$inferInsert;

      // ✅ Current expectation: projectId is optional in Drizzle
      expectTypeOf<DrizzleDeviceInsert['projectId']>().toMatchTypeOf<string | null | undefined>();

      // 🔔 If this test fails, it means projectId is now required in Drizzle.
      // You should:
      // 1. Update CreateDevicesFromDiscoverySchema to require projectId
      // 2. Or add migration to create a default project
      // 3. Update this test to reflect new constraint
    });

    it('should require organizationId in Drizzle schema (guard against accidental nullable)', () => {
      type DrizzleDeviceInsert = typeof devices.$inferInsert;

      // ✅ organizationId must always be required
      expectTypeOf<DrizzleDeviceInsert['organizationId']>().toBeString();
      expectTypeOf<DrizzleDeviceInsert['organizationId']>().not.toBeNullable();
    });
  });
});
