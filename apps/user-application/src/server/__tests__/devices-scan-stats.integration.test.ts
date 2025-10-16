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
import { initDatabase, resetDatabase, getDb } from '@repo/data-ops/database/setup';
import { Miniflare } from 'miniflare';
import path from 'node:path';
import { scanRuns, scanWorkflows, devices } from '@repo/data-ops/schema';
import { eq } from 'drizzle-orm';

describe('Device Scan Statistics (Integration)', () => {
  // Real IDs from local database
  const testOrgId = 'TbIfOEaeC8ugXZ60H21hQ15adbR8DxZz';
  const testUserId = '2zypi2dDgq8S0Y4ZgowF2vm6Psksnjfi'; // Real user ID from auth_user table

  // Test data IDs for cleanup
  const testDataIds = {
    workflows: [] as string[],
    scanRuns: [] as string[],
    devices: [] as string[],
  };

  beforeAll(async () => {
    // Reset any previously cached database instance
    resetDatabase();

    // Create Miniflare instance pointing to existing D1 database
    // Using database_id from wrangler.jsonc which maps to the existing SQLite file
    const mf = new Miniflare({
      modules: true,
      script: '',
      d1Databases: {
        DB: '93d2bd33-3b3e-42f3-a982-39b790922949', // database_id from wrangler.jsonc
      },
      d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
    });

    // Get the D1Database binding using the correct API
    const d1db = await mf.getD1Database('DB');

    // Initialize data-ops with the D1 binding
    initDatabase(d1db);

    console.log('✅ Connected to local D1 database via Miniflare');
    console.log('📊 Database ID: 93d2bd33-3b3e-42f3-a982-39b790922949');
    console.log('📋 Testing with organization:', testOrgId);

    // Insert test data
    const db = getDb();

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
    const [workflow1a] = await db.insert(scanWorkflows).values({
      organizationId: testOrgId,
      workflowId: 'test-workflow-1a',
      kind: 'PORT',
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T09:00:00Z'),
      finishedAt: new Date('2025-01-15T09:05:00Z'),
    }).returning();
    testDataIds.workflows.push(workflow1a.id);

    const [scanRun1a] = await db.insert(scanRuns).values({
      workflowId: workflow1a.id,
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-multiple-scans',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T09:00:00Z'),
      completedAt: new Date('2025-01-15T09:05:00Z'),
      resultSummary: {
        openPortCount: 2,
        ports: [
          { port: 80, service: 'http', state: 'open' },
          { port: 443, service: 'https', state: 'open' },
        ],
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun1a.id);

    // Second scan (latest) - 5 ports
    const [workflow1b] = await db.insert(scanWorkflows).values({
      organizationId: testOrgId,
      workflowId: 'test-workflow-1b',
      kind: 'PORT',
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T10:00:00Z'),
      finishedAt: new Date('2025-01-15T10:05:00Z'),
    }).returning();
    testDataIds.workflows.push(workflow1b.id);

    const [scanRun1b] = await db.insert(scanRuns).values({
      workflowId: workflow1b.id,
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-multiple-scans',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T10:00:00Z'),
      completedAt: new Date('2025-01-15T10:05:00Z'),
      resultSummary: {
        openPortCount: 5,
        ports: [
          { port: 80, service: 'http', state: 'open' },
          { port: 443, service: 'https', state: 'open' },
          { port: 22, service: 'ssh', state: 'open' },
          { port: 3306, service: 'mysql', state: 'open' },
          { port: 5432, service: 'postgresql', state: 'open' },
        ],
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun1b.id);

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

    const [workflow2] = await db.insert(scanWorkflows).values({
      organizationId: testOrgId,
      workflowId: 'test-workflow-2',
      kind: 'PORT',
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T11:00:00Z'),
      finishedAt: new Date('2025-01-15T11:05:00Z'),
    }).returning();
    testDataIds.workflows.push(workflow2.id);

    const [scanRun2] = await db.insert(scanRuns).values({
      workflowId: workflow2.id,
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-no-ports',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T11:00:00Z'),
      completedAt: new Date('2025-01-15T11:05:00Z'),
      resultSummary: {
        openPortCount: 0,
        ports: [],
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun2.id);

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

    const [workflow3] = await db.insert(scanWorkflows).values({
      organizationId: testOrgId,
      workflowId: 'test-workflow-3',
      kind: 'PORT',
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T12:00:00Z'),
      finishedAt: new Date('2025-01-15T12:05:00Z'),
    }).returning();
    testDataIds.workflows.push(workflow3.id);

    const [scanRun3] = await db.insert(scanRuns).values({
      workflowId: workflow3.id,
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-device-single-port',
      requestedById: testUserId,
      status: 'SUCCEEDED',
      startedAt: new Date('2025-01-15T12:00:00Z'),
      completedAt: new Date('2025-01-15T12:05:00Z'),
      resultSummary: {
        openPortCount: 1,
        ports: [
          { port: 443, service: 'https', state: 'open' },
        ],
      },
    }).returning();
    testDataIds.scanRuns.push(scanRun3.id);

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
    console.log(`   Workflows: ${testDataIds.workflows.length}`);
    console.log(`   Scan Runs: ${testDataIds.scanRuns.length}`);
  });

  afterAll(async () => {
    // Clean up test data in reverse order (respect foreign keys)
    const db = getDb();

    // Delete scan runs first
    for (const id of testDataIds.scanRuns) {
      await db.delete(scanRuns).where(eq(scanRuns.id as any, id));
    }

    // Delete workflows
    for (const id of testDataIds.workflows) {
      await db.delete(scanWorkflows).where(eq(scanWorkflows.id as any, id));
    }

    // Delete devices last
    for (const id of testDataIds.devices) {
      await db.delete(devices).where(eq(devices.id as any, id));
    }

    console.log('🧹 Cleaned up test data');
    console.log(`   Deleted ${testDataIds.scanRuns.length} scan runs`);
    console.log(`   Deleted ${testDataIds.workflows.length} workflows`);
    console.log(`   Deleted ${testDataIds.devices.length} devices`);
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

    // Verify it has the latest scan's ports
    const ports = device!.scanStats!.ports;
    expect(ports).toContainEqual(expect.objectContaining({ port: 3306, service: 'mysql' }));
    expect(ports).toContainEqual(expect.objectContaining({ port: 5432, service: 'postgresql' }));

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
      expect.objectContaining({ port: 443, service: 'https', state: 'open' })
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

    // Each port should have required fields
    ports.forEach((port: any) => {
      expect(port).toHaveProperty('port');
      expect(port).toHaveProperty('service');
      expect(port).toHaveProperty('state');
      expect(typeof port.port).toBe('number');
      expect(typeof port.service).toBe('string');
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
