/**
 * Integration Tests for device scan statistics
 *
 * Uses REAL local D1 database via Miniflare to test actual implementation
 * No mocks - tests real queries, real data, real behavior
 *
 * Testing Approach:
 * - Uses Miniflare.getD1Database() to get proper D1Database binding
 * - Connects to existing local D1 database file (safe to modify for tests)
 * - Inserts test data (scan_runs, devices) in beforeAll
 * - Cleans up test data in afterAll
 * - Tests data-ops query functions against real database
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDevicesForTenant } from '@repo/data-ops/queries/devices';
import { getDb } from '@repo/data-ops/database/setup';
import { scanRuns, devices, scanRunDevices } from '@repo/data-ops/schema';
import { auth_user, organization } from '@repo/data-ops/drizzle/auth-schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

describe('Device Scan Statistics (Integration)', () => {
  // Test data IDs (created in beforeAll, cleaned up in afterAll)
  let testOrgId: string;
  let testUserId: string;

  // Test data IDs for cleanup
  const testDataIds = {
    scanRuns: [] as string[],
    devices: [] as string[],
    scanRunDevices: [] as string[],
  };

  beforeAll(async () => {
    // Database is already initialized by global setup
    console.log('📊 Using shared database connection (global setup)');

    // Create test organization and user using better-auth schema
    const db = getDb();

    testOrgId = createId();
    const [_org] = await db.insert(organization).values({
      id: testOrgId,
      name: 'Test Organization',
      slug: `test-org-${Date.now()}`,
      createdAt: new Date(),
    }).returning();

    testUserId = createId();
    const [_user] = await db.insert(auth_user).values({
      id: testUserId,
      name: 'Test User',
      email: `test-user-${Date.now()}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.log('📋 Created test organization and user:', { testOrgId, testUserId });

    // Insert test data

    // Device 1: Multiple scans with different port results (shows latest scan logic)
    const [device1] = await db.insert(devices).values({
      organizationId: testOrgId,
      name: 'test-device-multiple-scans',
      source: 'TEST',
      scope: 'EXTERNAL',
      state: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    }).returning();
    testDataIds.devices.push(device1.id);

    // First scan (older) - 2 ports
    const [scanRun1a] = await db.insert(scanRuns).values({
      organizationId: testOrgId,
      restateWorkflowId: 'portscan-test-1a',
      workflowKind: 'DISCOVERY',
      workflowStatus: 'SUCCEEDED',
      workflowStartedAt: new Date('2025-01-15T09:00:00Z'),
      workflowFinishedAt: new Date('2025-01-15T09:05:00Z'),
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-multiple-scans',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T09:00:00Z'),
      completedAt: new Date('2025-01-15T09:05:00Z'),
      resultSummary: {
        portSnapshots: [
          {
            port: 80,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'http', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T09:05:00Z' },
          },
          {
            port: 443,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'https', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T09:05:00Z' },
          },
        ],
        portScanStats: {
          totalOpenPorts: 2,
          portsWithService: 2,
          portsStored: 2,
          serviceDetectionRate: 100,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        },
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun1a.id);

    // Link scan run to device via junction table
    await db.insert(scanRunDevices).values({
      runId: scanRun1a.id,
      deviceId: device1.id,
      organizationId: testOrgId,
      role: 'TARGET',
      metadata: {},
    });

    // Second scan (latest) - 5 ports
    const [scanRun1b] = await db.insert(scanRuns).values({
      organizationId: testOrgId,
      restateWorkflowId: 'portscan-test-1b',
      workflowKind: 'DISCOVERY',
      workflowStatus: 'SUCCEEDED',
      workflowStartedAt: new Date('2025-01-15T10:00:00Z'),
      workflowFinishedAt: new Date('2025-01-15T10:05:00Z'),
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-multiple-scans',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T10:00:00Z'),
      completedAt: new Date('2025-01-15T10:05:00Z'),
      resultSummary: {
        portSnapshots: [
          {
            port: 80,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'http', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T10:05:00Z' },
          },
          {
            port: 443,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'https', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T10:05:00Z' },
          },
          {
            port: 22,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'ssh', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T10:05:00Z' },
          },
          {
            port: 3306,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'mysql', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T10:05:00Z' },
          },
          {
            port: 5432,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'postgresql', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T10:05:00Z' },
          },
        ],
        portScanStats: {
          totalOpenPorts: 5,
          portsWithService: 5,
          portsStored: 5,
          serviceDetectionRate: 100,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        },
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun1b.id);

    // Link scan run to device via junction table
    await db.insert(scanRunDevices).values({
      runId: scanRun1b.id,
      deviceId: device1.id,
      organizationId: testOrgId,
      role: 'TARGET',
      metadata: {},
    });

    // Device 2: No open ports
    const [device2] = await db.insert(devices).values({
      organizationId: testOrgId,
      name: 'test-device-no-ports',
      source: 'TEST',
      scope: 'EXTERNAL',
      state: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    }).returning();
    testDataIds.devices.push(device2.id);

    const [scanRun2] = await db.insert(scanRuns).values({
      organizationId: testOrgId,
      restateWorkflowId: 'portscan-test-2',
      workflowKind: 'DISCOVERY',
      workflowStatus: 'SUCCEEDED',
      workflowStartedAt: new Date('2025-01-15T11:00:00Z'),
      workflowFinishedAt: new Date('2025-01-15T11:05:00Z'),
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-no-ports',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T11:00:00Z'),
      completedAt: new Date('2025-01-15T11:05:00Z'),
      resultSummary: {
        portSnapshots: [],
        portScanStats: {
          totalOpenPorts: 0,
          portsWithService: 0,
          portsStored: 0,
          serviceDetectionRate: 0,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        },
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun2.id);

    // Link scan run to device via junction table
    await db.insert(scanRunDevices).values({
      runId: scanRun2.id,
      deviceId: device2.id,
      organizationId: testOrgId,
      role: 'TARGET',
      metadata: {},
    });

    // Device 3: Single port (minimal case)
    const [device3] = await db.insert(devices).values({
      organizationId: testOrgId,
      name: 'test-device-single-port',
      source: 'TEST',
      scope: 'EXTERNAL',
      state: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    }).returning();
    testDataIds.devices.push(device3.id);

    const [scanRun3] = await db.insert(scanRuns).values({
      restateWorkflowId: 'portscan-test-3',
      workflowKind: 'DISCOVERY',
      workflowStatus: 'SUCCEEDED',
      workflowStartedAt: new Date('2025-01-15T12:00:00Z'),
      workflowFinishedAt: new Date('2025-01-15T12:05:00Z'),
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-single-port',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T12:00:00Z'),
      completedAt: new Date('2025-01-15T12:05:00Z'),
      resultSummary: {
        portSnapshots: [
          {
            port: 443,
            protocol: 'tcp',
            state: 'open',
            service: { name: 'https', product: null, version: null, cpe: null },
            metadata: { lastSeenAt: '2025-01-15T12:05:00Z' },
          },
        ],
        portScanStats: {
          totalOpenPorts: 1,
          portsWithService: 1,
          portsStored: 1,
          serviceDetectionRate: 100,
          suspiciousAllPortsOpen: false,
          scanPattern: 'Normal',
        },
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun3.id);

    // Link scan run to device via junction table
    await db.insert(scanRunDevices).values({
      runId: scanRun3.id,
      deviceId: device3.id,
      organizationId: testOrgId,
      role: 'TARGET',
      metadata: {},
    });

    // Device 4: No scans (for testing undefined scanStats)
    const [device4] = await db.insert(devices).values({
      organizationId: testOrgId,
      name: 'test-device-no-scans',
      source: 'TEST',
      scope: 'EXTERNAL',
      state: 'AVAILABLE',
      verificationStatus: 'CANDIDATE',
    }).returning();
    testDataIds.devices.push(device4.id);

    console.log('📝 Inserted test data:');
    console.log(`   Devices: ${testDataIds.devices.length}`);
    console.log(`   Scan Runs: ${testDataIds.scanRuns.length}`);
  });

  afterAll(async () => {
    // Clean up test data in reverse order (respect foreign keys)
    const db = getDb();

    // Delete junction table entries first (scan_run_devices references scan_runs and devices)
    await db.delete(scanRunDevices).where(eq(scanRunDevices.organizationId as any, testOrgId));

    // Delete scan runs
    for (const id of testDataIds.scanRuns) {
      await db.delete(scanRuns).where(eq(scanRuns.id as any, id));
    }

    // Delete devices
    for (const id of testDataIds.devices) {
      await db.delete(devices).where(eq(devices.id as any, id));
    }

    // Delete user and organization
    await db.delete(auth_user).where(eq(auth_user.id as any, testUserId));
    await db.delete(organization).where(eq(organization.id as any, testOrgId));

    console.log('🧹 Cleaned up test data');
    console.log(`   Deleted junction table entries`);
    console.log(`   Deleted ${testDataIds.scanRuns.length} scan runs`);
    console.log(`   Deleted ${testDataIds.devices.length} devices`);
    console.log(`   Deleted test user and organization`);
  });

  it('should return all test devices with correct structure', async () => {
    const result = await getDevicesForTenant(testOrgId);

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('totalCount');
    expect(Array.isArray(result.items)).toBe(true);

    // Should find at least our 4 test devices (plus any existing ones)
    expect(result.totalCount).toBeGreaterThanOrEqual(4);

    console.log(`📊 Found ${result.items.length} devices (total: ${result.totalCount})`);
  });

  it('should return latest scan stats when device has multiple scans', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-multiple-scans');

    // Assert: Device exists with scan stats
    expect(device).toBeDefined();
    expect(device?.scanStats).toBeDefined();

    // Should show LATEST scan (5 ports), not first scan (2 ports)
    expect(device!.scanStats!.openPortCount).toBe(5);
    expect(device!.scanStats!.scanCount).toBe(2); // Total number of scans
    expect(device!.scanStats!.ports).toHaveLength(5);

    // Verify it has the latest scan's ports (service is now an object)
    const ports = device!.scanStats!.ports;
    expect(ports).toContainEqual(expect.objectContaining({
      port: 3306,
      service: expect.objectContaining({ name: 'mysql' })
    }));
    expect(ports).toContainEqual(expect.objectContaining({
      port: 5432,
      service: expect.objectContaining({ name: 'postgresql' })
    }));

    console.log('✅ Latest scan stats:', {
      name: device!.name,
      scanCount: device!.scanStats!.scanCount,
      openPortCount: device!.scanStats!.openPortCount,
      lastScanAt: device!.scanStats!.lastScanAt,
    });
  });

  it('should handle device with no open ports', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-no-ports');

    expect(device).toBeDefined();
    expect(device?.scanStats).toBeDefined();

    // Should have scan stats even with 0 ports
    expect(device!.scanStats!.openPortCount).toBe(0);
    expect(device!.scanStats!.ports).toEqual([]);
    expect(device!.scanStats!.scanCount).toBe(1);
    expect(device!.scanStats!.lastScanAt).toBeInstanceOf(Date);

    console.log('✅ Device with no ports:', {
      name: device!.name,
      openPortCount: device!.scanStats!.openPortCount,
      portsArray: device!.scanStats!.ports,
    });
  });

  it('should handle device with single port', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-single-port');

    expect(device).toBeDefined();
    expect(device?.scanStats).toBeDefined();

    expect(device!.scanStats!.openPortCount).toBe(1);
    expect(device!.scanStats!.ports).toHaveLength(1);
    expect(device!.scanStats!.ports[0]).toEqual(
      expect.objectContaining({
        port: 443,
        service: expect.objectContaining({ name: 'https' }),
        state: 'open'
      })
    );

    console.log('✅ Device with single port:', {
      name: device!.name,
      port: device!.scanStats!.ports[0],
    });
  });

  it('should return undefined scanStats for device with no scans', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-no-scans');

    expect(device).toBeDefined();
    expect(device?.scanStats).toBeUndefined();

    console.log('✅ Device with no scans has undefined scanStats');
  });

  it('should verify port details structure', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-multiple-scans');

    const ports = device!.scanStats!.ports;

    // Each port should have required fields (service is now an object)
    ports.forEach((port: any) => {
      expect(port).toHaveProperty('port');
      expect(port).toHaveProperty('service');
      expect(port).toHaveProperty('state');
      expect(typeof port.port).toBe('number');
      expect(typeof port.service).toBe('object'); // Service is now an object with name, product, etc.
      expect(port.state).toBe('open');
    });

    console.log('✅ Port details verified:', ports);
  });

  it('should calculate total scan count correctly', async () => {
    const result = await getDevicesForTenant(testOrgId);
    const device = result.items.find((d: any) => d.name === 'test-device-multiple-scans');

    // Device has 2 scans (first + latest)
    expect(device!.scanStats!.scanCount).toBe(2);
    expect(device!.scanStats!.totalScans).toBe(2);

    console.log('✅ Total scan count:', device!.scanStats!.scanCount);
  });
});
