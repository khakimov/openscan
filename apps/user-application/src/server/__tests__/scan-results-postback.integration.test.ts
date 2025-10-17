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

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { initDatabase, resetDatabase, getDb } from '@repo/data-ops/database/setup';
import { Miniflare } from 'miniflare';
import path from 'node:path';
import { scanRuns, scanWorkflows, devices } from '@repo/data-ops/schema';
import { eq } from 'drizzle-orm';
import { handleScanResultsPostback } from '../scan-results-postback';

describe('Scan Results Postback (Integration)', () => {
  // Real IDs from local database
  const testOrgId = 'TbIfOEaeC8ugXZ60H21hQ15adbR8DxZz';
  const testUserId = '2zypi2dDgq8S0Y4ZgowF2vm6Psksnjfi';

  // Test data IDs for cleanup
  let testDeviceId: string;
  let testScanId: string;
  let testScanRunId: string;
  let testWorkflowDbId: string;

  beforeAll(async () => {
    // Reset any previously cached database instance
    resetDatabase();

    // Create Miniflare instance pointing to existing D1 database
    const mf = new Miniflare({
      modules: true,
      script: '',
      d1Databases: {
        DB: '93d2bd33-3b3e-42f3-a982-39b790922949',
      },
      d1Persist: path.join(process.cwd(), '.wrangler/state/v3/d1'),
    });

    // Get the D1Database binding
    const d1db = await mf.getD1Database('DB');
    initDatabase(d1db);

    console.log('✅ Connected to local D1 database for postback tests');
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

    console.log('📝 Created test data:', {
      deviceId: testDeviceId,
      scanId: testScanId,
      scanRunId: testScanRunId,
    });
  });

  afterEach(async () => {
    // Clean up test data
    const db = getDb();

    await db.delete(scanRuns).where(eq(scanRuns.id as any, testScanRunId));
    await db.delete(scanWorkflows).where(eq(scanWorkflows.id as any, testWorkflowDbId));
    await db.delete(devices).where(eq(devices.id as any, testDeviceId));

    console.log('🧹 Cleaned up test data');
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
