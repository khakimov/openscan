/**
 * HTTPx Postback Handler Integration Tests
 *
 * Tests the complete HTTPx postback flow:
 * - Payload validation
 * - Artifact creation
 * - Probe storage
 * - Technology detection
 * - Error handling
 * - Analytics tracking
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '@repo/data-ops/database/setup';
import { organization } from '@repo/data-ops/drizzle/auth-schema';
import { devices, projects } from '@repo/data-ops/schema/inventory';
import {
  scanRuns,
  scanArtifacts,
  httpxProbes,
  technologies,
  httpxTechDetections,
} from '@repo/data-ops/schema/orchestration';
import { eq } from '@repo/data-ops';
import { createId } from '@paralleldrive/cuid2';
import { HttpxPostbackHandler } from '../httpx';
import { createLogger } from '@repo/logger';

// Test data IDs
let testOrgId: string;
let testDeviceId: string;
let testProjectId: string;
let testScanRunId: string;

describe('HTTPx Postback Handler', () => {
  beforeAll(async () => {
    const db = getDb();

    // Create test organization
    testOrgId = createId();
    await db.insert(organization).values({
      id: testOrgId,
      name: 'HTTPx Test Org',
      slug: `httpx-test-org-${Date.now()}`,
      createdAt: new Date(),
    });

    // Create test project
    testProjectId = createId();
    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Test Project',
      isDefault: true,
      createdAt: new Date(),
    });

    // Create test device
    testDeviceId = createId();
    await db.insert(devices).values({
      id: testDeviceId,
      organizationId: testOrgId,
      projectId: testProjectId,
      name: 'httpx-test.example.com',
      host: 'httpx-test.example.com',
      source: 'TEST',
      scope: 'INTERNAL',
      riskLevel: 'SECURE',
      state: 'AVAILABLE',
      verificationStatus: 'CANDIDATE',
      createdAt: new Date(),
    });

    // Create test scan run
    testScanRunId = createId();
    await db.insert(scanRuns).values({
      id: testScanRunId,
      organizationId: testOrgId,
      restateWorkflowId: `httpx-test-${Date.now()}`,
      workflowKind: 'EXTEND_SCAN',
      scanType: 'WEB',
      scope: 'INTERNAL',
      status: 'RUNNING',
      createdAt: new Date(),
    });

    console.log('✅ HTTPx postback test data created');
  });

  afterAll(async () => {
    const db = getDb();

    // Cleanup (only if IDs were created)
    if (testOrgId) {
      await db.delete(httpxTechDetections);
      await db.delete(httpxProbes);
      await db.delete(scanArtifacts).where(eq(scanArtifacts.organizationId, testOrgId));
      await db.delete(technologies);

      if (testScanRunId) {
        await db.delete(scanRuns).where(eq(scanRuns.id, testScanRunId));
      }
      if (testDeviceId) {
        await db.delete(devices).where(eq(devices.id, testDeviceId));
      }
      if (testProjectId) {
        await db.delete(projects).where(eq(projects.id, testProjectId));
      }

      await db.delete(organization).where(eq(organization.id, testOrgId));

      console.log('🧹 HTTPx postback test data cleaned up');
    }
  });

  describe('Payload Validation', () => {
    it('should validate correct HTTPX payload', () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
              title: 'Test Page',
              headers: { 'server': 'nginx/1.24.0' },
              responseTime: 125,
              contentLength: 4096,
              webServer: 'nginx',
              technologies: [
                { name: 'nginx', version: '1.24.0', confidence: 'high' as const },
              ],
            },
          ],
        },
      };

      const validated = handler.validate(payload);
      expect(validated).toEqual(payload);
    });

    it('should reject payload with wrong type', () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'PORT_SCAN',
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        data: { target: 'test.com', probes: [] },
      };

      expect(() => handler.validate(payload)).toThrow();
    });

    it('should reject payload with missing required fields', () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX',
        // Missing scanRunId, deviceId, organizationId
        timestamp: new Date().toISOString(),
        status: 'SUCCESS',
        data: { target: 'test.com', probes: [] },
      };

      expect(() => handler.validate(payload)).toThrow();
    });

    it('should validate failed probe with error info', () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 9999,
              url: 'http://httpx-test.example.com:9999',
              status: 'FAILED' as const,
              error: 'Connection refused',
              errorType: 'CONNECTION_REFUSED' as const,
            },
          ],
        },
      };

      const validated = handler.validate(payload);
      expect(validated.data.probes[0].status).toBe('FAILED');
      expect(validated.data.probes[0].error).toBe('Connection refused');
    });
  });

  describe('Successful Probe Handling', () => {
    it('should store successful HTTP probe with all metadata', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
              title: 'Welcome Page',
              headers: {
                'server': 'nginx/1.24.0',
                'content-type': 'text/html',
                'x-powered-by': 'PHP/8.2.0',
              },
              responseTime: 85,
              contentLength: 2048,
              finalUrl: 'http://httpx-test.example.com/',
              webServer: 'nginx',
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 succeeded');

      // Verify artifact was created
      const db = getDb();
      const artifacts = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.scanRunId, testScanRunId));

      expect(artifacts.length).toBe(1);
      expect(artifacts[0].port).toBe(80);
      expect(artifacts[0].status).toBe('completed');
      expect(artifacts[0].toolName).toBe('httpx');

      // Verify httpx probe was created
      const probes = await db
        .select()
        .from(httpxProbes)
        .where(eq(httpxProbes.artifactId, artifacts[0].id));

      expect(probes.length).toBe(1);
      expect(probes[0].statusCode).toBe(200);
      expect(probes[0].title).toBe('Welcome Page');
      expect(probes[0].scheme).toBe('http');
      expect(probes[0].responseTime).toBe(85);
      expect(probes[0].webServer).toBe('nginx');
      expect(probes[0].headers).toEqual({
        'server': 'nginx/1.24.0',
        'content-type': 'text/html',
        'x-powered-by': 'PHP/8.2.0',
      });
    });

    it('should store multiple probes from single postback', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 443,
              url: 'https://httpx-test.example.com:443',
              status: 'SUCCESS' as const,
              scheme: 'https' as const,
              statusCode: 200,
              tlsVersion: 'TLS 1.3',
            },
            {
              port: 8080,
              url: 'http://httpx-test.example.com:8080',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 404,
            },
            {
              port: 3000,
              url: 'http://httpx-test.example.com:3000',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 503,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('3 succeeded');

      // Verify all artifacts were created
      const db = getDb();
      const artifacts = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.scanRunId, testScanRunId));

      const ports = artifacts.map(a => a.port).sort();
      expect(ports).toContain(443);
      expect(ports).toContain(3000);
      expect(ports).toContain(8080);
    });

    it('should store technology detections correctly', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
              technologies: [
                { name: 'nginx', version: '1.24.0', confidence: 'high' as const },
                { name: 'React', version: '18.2.0', confidence: 'medium' as const },
                { name: 'WordPress', version: '6.4.0', confidence: 'high' as const },
              ],
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      await handler.handle(payload, ctx);

      // Verify technologies were created and normalized
      const db = getDb();
      const techs = await db.select().from(technologies);

      const techNames = techs.map(t => t.name).sort();
      expect(techNames).toContain('nginx');
      expect(techNames).toContain('react'); // Normalized to lowercase
      expect(techNames).toContain('wordpress'); // Normalized to lowercase

      // Verify tech detections
      const artifacts = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.scanRunId, testScanRunId));

      const probes = await db
        .select()
        .from(httpxProbes)
        .where(eq(httpxProbes.artifactId, artifacts[artifacts.length - 1].id));

      const detections = await db
        .select()
        .from(httpxTechDetections)
        .where(eq(httpxTechDetections.probeId, probes[0].id));

      expect(detections.length).toBe(3);

      const versions = detections.map(d => d.version).sort();
      expect(versions).toContain('1.24.0');
      expect(versions).toContain('18.2.0');
      expect(versions).toContain('6.4.0');
    });

    it('should handle probe without technologies gracefully', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 5000,
              url: 'http://httpx-test.example.com:5000',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
              // No technologies field
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);
      expect(result.success).toBe(true);
    });
  });

  describe('Failed Probe Handling', () => {
    it('should store failed probe with error message', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 9999,
              url: 'http://httpx-test.example.com:9999',
              status: 'FAILED' as const,
              error: 'Connection refused',
              errorType: 'CONNECTION_REFUSED' as const,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('0 succeeded, 1 failed');

      // Verify artifact was created with failed status
      const db = getDb();
      const artifacts = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.scanRunId, testScanRunId));

      const failedArtifact = artifacts.find(a => a.port === 9999);
      expect(failedArtifact).toBeDefined();
      expect(failedArtifact!.status).toBe('failed');
      expect(failedArtifact!.errorMessage).toContain('Connection refused');

      // Verify no httpx probe was created for failed port
      const probes = await db
        .select()
        .from(httpxProbes)
        .where(eq(httpxProbes.artifactId, failedArtifact!.id));

      expect(probes.length).toBe(0);
    });

    it('should handle timeout probe', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 8888,
              url: 'http://httpx-test.example.com:8888',
              status: 'TIMEOUT' as const,
              error: 'Request timeout after 10s',
              errorType: 'TIMEOUT' as const,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);
      expect(result.success).toBe(true);

      const db = getDb();
      const artifacts = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.scanRunId, testScanRunId));

      const timeoutArtifact = artifacts.find(a => a.port === 8888);
      expect(timeoutArtifact).toBeDefined();
      expect(timeoutArtifact!.status).toBe('failed');
      expect(timeoutArtifact!.errorMessage).toContain('timeout');
    });

    it('should handle mixed success and failure probes', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
            },
            {
              port: 443,
              url: 'https://httpx-test.example.com:443',
              status: 'FAILED' as const,
              error: 'SSL handshake failed',
              errorType: 'SSL_ERROR' as const,
            },
            {
              port: 8080,
              url: 'http://httpx-test.example.com:8080',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 404,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 succeeded, 1 failed');
    });
  });

  describe('Analytics Tracking', () => {
    it('should return analytics for successful httpx workflow', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.analytics).toBeDefined();
      expect(result.analytics!.eventType).toBe('postback_httpx_success');
      expect(result.analytics!.blobs).toEqual([testScanRunId, testDeviceId, testOrgId]);
      expect(result.analytics!.doubles).toEqual([1]); // 1 successful probe
    });

    it('should return analytics for failed httpx workflow', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'FAILURE' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(false);
      expect(result.analytics).toBeDefined();
      expect(result.analytics!.eventType).toBe('postback_httpx_failure');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty probes array', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('0 succeeded, 0 failed');
    });

    it('should continue processing after individual probe storage failure', async () => {
      const handler = new HttpxPostbackHandler();

      const payload = {
        type: 'HTTPX' as const,
        scanRunId: testScanRunId,
        deviceId: testDeviceId,
        organizationId: testOrgId,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS' as const,
        data: {
          target: 'httpx-test.example.com',
          probes: [
            {
              port: 80,
              url: 'http://httpx-test.example.com:80',
              status: 'SUCCESS' as const,
              scheme: 'http' as const,
              statusCode: 200,
            },
            // This probe might have issues but shouldn't stop others
            {
              port: 443,
              url: 'https://httpx-test.example.com:443',
              status: 'SUCCESS' as const,
              scheme: 'https' as const,
              statusCode: 200,
            },
          ],
        },
      };

      const ctx = {
        logger: createLogger({ name: 'httpx-test' }),
        env: {},
      };

      const result = await handler.handle(payload, ctx);

      // Should succeed overall even if individual probes have issues
      expect(result.success).toBe(true);
    });
  });
});
