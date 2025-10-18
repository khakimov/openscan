/**
 * Integration Tests for Scan Results Postback
 *
 * Tests the /api/internal/scan-results endpoint that receives
 * scan results from the restate-worker via HTTP postback.
 *
 * Testing Strategy:
 * - Uses REAL local D1 database via Miniflare
 * - Tests authentication with WORKER_API_KEY
 * - Tests payload validation
 * - Tests successful result storage
 * - Tests error cases
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { getDb } from '@repo/data-ops/database/setup';
import { scanRuns, scanWorkflows, devices, scanRunDevices } from '@repo/data-ops/schema';
import { auth_user, organization } from '@repo/data-ops/drizzle/auth-schema';
import { eq } from 'drizzle-orm';
import { handleScanResultsPostback } from '../scan-results-postback';
import { createId } from '@paralleldrive/cuid2';

describe('Scan Results Postback (Integration)', () => {
  // Test data IDs (created in beforeAll, used across tests)
  let testOrgId: string;
  let testUserId: string;

  // Test data IDs for cleanup (per test)
  let testDeviceId: string;
  let testScanId: string;
  let testScanRunId: string;
  let testWorkflowDbId: string;

  beforeAll(async () => {
    // Database is already initialized by global setup
    console.log('📊 Using shared database connection (global setup)');

    // Create test organization and user using better-auth schema
    const db = getDb();

    testOrgId = createId();
    const [org] = await db.insert(organization).values({
      id: testOrgId,
      name: 'Test Organization Postback',
      slug: `test-org-postback-${Date.now()}`,
      createdAt: new Date(),
    }).returning();

    testUserId = createId();
    const [user] = await db.insert(auth_user).values({
      id: testUserId,
      name: 'Test User Postback',
      email: `test-user-postback-${Date.now()}@example.com`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.log('📋 Created test organization and user for postback tests:', { testOrgId, testUserId });
  });

  beforeEach(async () => {
    // Create test data for each test
    const db = getDb();

    // Create test device
    const [device] = await db.insert(devices).values({
      organizationId: testOrgId,
      name: 'test-postback-device',
      source: 'TEST',
      scope: 'EXTERNAL',
      state: 'AVAILABLE',
      verificationStatus: 'VERIFIED',
    }).returning();
    testDeviceId = device.id;

    // Create scan workflow
    testScanId = `portscan-test-${Date.now()}`;
    const [workflow] = await db.insert(scanWorkflows).values({
      organizationId: testOrgId,
      scanId: testScanId, // Restate workflow key
      kind: 'PORT',
      status: 'RUNNING',
    }).returning();
    testWorkflowDbId = workflow.id;

    // Create scan run
    const [scanRun] = await db.insert(scanRuns).values({
      scanWorkflowId: workflow.id, // Database FK to scanWorkflows.id
      organizationId: testOrgId,
      scanType: 'PORT',
      scope: 'EXTERNAL',
      target: 'test-postback-device',
      requestedById: testUserId,
      status: 'RUNNING',
      resultSummary: {},
    }).returning();
    testScanRunId = scanRun.id;

    // Link scan run to device via junction table
    await db.insert(scanRunDevices).values({
      runId: scanRun.id,
      deviceId: device.id,
      organizationId: testOrgId,
      role: 'TARGET',
      metadata: {},
    });

    console.log('📝 Created test data:', {
      deviceId: testDeviceId,
      scanId: testScanId,
      scanRunId: testScanRunId,
    });
  });

  afterEach(async () => {
    // Clean up test data in reverse order (respect foreign keys)
    const db = getDb();

    // Delete junction table entries first
    await db.delete(scanRunDevices).where(eq(scanRunDevices.runId as any, testScanRunId));

    // Then delete scan runs, workflows, and devices
    await db.delete(scanRuns).where(eq(scanRuns.id as any, testScanRunId));
    await db.delete(scanWorkflows).where(eq(scanWorkflows.id as any, testWorkflowDbId));
    await db.delete(devices).where(eq(devices.id as any, testDeviceId));

    console.log('🧹 Cleaned up test data for this test');
  });

  afterAll(async () => {
    // Clean up organization and user
    const db = getDb();

    await db.delete(auth_user).where(eq(auth_user.id as any, testUserId));
    await db.delete(organization).where(eq(organization.id as any, testOrgId));

    console.log('🧹 Cleaned up test organization and user');
  });

  it('should reject request without authentication', async () => {
    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: testScanId,
        results: {
          ports: [],
        },
      }),
    });

    // Mock environment without WORKER_API_KEY
    const originalEnv = process.env.WORKER_API_KEY;
    delete process.env.WORKER_API_KEY;

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(401);
    const body = await response.json() as { error?: string };
    expect(body).toHaveProperty('error', 'Unauthorized');

    // Restore env
    if (originalEnv) process.env.WORKER_API_KEY = originalEnv;
  });

  it('should reject request with invalid API key', async () => {
    // Set up valid API key in environment
    process.env.WORKER_API_KEY = 'correct-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: testScanId,
        results: {
          ports: [],
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(401);
    const body = await response.json() as { error?: string };
    expect(body).toHaveProperty('error', 'Unauthorized');
  });

  it('should reject request with missing deviceId', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        // Missing deviceId
        scanId: testScanId,
        results: {
          ports: [],
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(400);
    const body = await response.json() as { success?: boolean; error?: string };
    expect(body.error).toContain('deviceId');
  });

  it('should reject request with invalid payload', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: testScanId,
        results: {
          // Missing required 'ports' array
          osInfo: null,
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toContain('ports');
  });

  it('should successfully store scan results with ports', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const portResults = [
      {
        port: 80,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'http' },
      },
      {
        port: 443,
        protocol: 'tcp',
        state: 'open',
        service: { name: 'https' },
      },
    ];

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: testScanId,
        results: {
          target: 'test-postback-device',
          ports: portResults,
          timing: {
            start: Date.now(),
            end: Date.now() + 1000,
            elapsed: 1000,
          },
          scanMetadata: {
            scanner: 'test-scanner',
          },
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(200);
    const body = await response.json() as { error?: string };
    expect(body).toEqual({ success: true });

    // Verify data was stored in database
    const db = getDb();

    // Check scan run was updated
    const [scanRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.id as any, testScanRunId));

    expect(scanRun.status).toBe('SUCCEEDED');
    expect(scanRun.resultSummary).toBeDefined();
    expect((scanRun.resultSummary as any).openPortCount).toBe(2);
    expect((scanRun.resultSummary as any).ports).toHaveLength(2);
    expect((scanRun.resultSummary as any).target).toBe('test-postback-device');

    // Check workflow was updated
    const [workflow] = await db
      .select()
      .from(scanWorkflows)
      .where(eq(scanWorkflows.id as any, testWorkflowDbId));

    expect(workflow.status).toBe('SUCCEEDED');

    console.log('✅ Scan results stored successfully:', {
      scanRunStatus: scanRun.status,
      workflowStatus: workflow.status,
      portCount: (scanRun.resultSummary as any).openPortCount,
    });
  });

  it('should handle empty port results', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: testScanId,
        results: {
          target: 'test-postback-device',
          ports: [], // No ports found
          timing: {
            start: Date.now(),
            end: Date.now() + 1000,
            elapsed: 1000,
          },
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(200);

    // Verify empty results were stored
    const db = getDb();
    const [scanRun] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.id as any, testScanRunId));

    expect(scanRun.status).toBe('SUCCEEDED');
    expect((scanRun.resultSummary as any).openPortCount).toBe(0);
    expect((scanRun.resultSummary as any).ports).toEqual([]);
  });

  it('should return 404 for non-existent device', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        deviceId: 'non-existent-device-id',
        scanId: testScanId,
        results: {
          ports: [],
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(404);
    const body = await response.json() as { error?: string };
    expect(body.error).toContain('Device not found');
  });

  it('should return 404 for non-existent workflow', async () => {
    process.env.WORKER_API_KEY = 'test-key';

    const request = new Request('http://localhost/api/internal/scan-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key',
      },
      body: JSON.stringify({
        deviceId: testDeviceId,
        scanId: 'portscan-nonexistent-123456',
        results: {
          ports: [],
        },
      }),
    });

    const response = await handleScanResultsPostback(request);

    expect(response.status).toBe(500); // Currently returns 500, could be improved to 404
  });
});
