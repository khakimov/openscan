/**
 * Scan Artifacts Query Tests
 *
 * Comprehensive tests for scan artifacts data-ops queries covering:
 * - Happy paths (successful creation, updates, queries)
 * - Edge cases (nullable fields, empty results, duplicates)
 * - Security (cross-org isolation, access validation)
 * - Integration (complex queries with joins)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../../database/setup';
import { organization, auth_user } from '../../drizzle/auth-schema';
import { devices, projects } from '../../schema/inventory';
import { scanRuns, scanArtifacts, httpxProbes, technologies, httpxTechDetections } from '../../schema/orchestration';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import {
  createScanArtifact,
  updateArtifactStatus,
  createHttpxProbe,
  findOrCreateTechnology,
  createTechDetection,
  getDeviceArtifacts,
  getArtifactsForScanRun,
  getTechnologyStats,
  getDevicesByTechnology,
} from '../scan-artifacts';

// Test data IDs
let orgAId: string;
let orgBId: string;
let deviceAId: string;
let deviceBId: string;
let projectAId: string;
let projectBId: string;
let scanRunAId: string;
let scanRunBId: string;

describe('Scan Artifacts Queries', () => {
  beforeAll(async () => {
    const db = getDb();

    // Create Organization A with Device A and Scan Run A
    orgAId = createId();
    await db.insert(organization).values({
      id: orgAId,
      name: 'Scan Artifacts Test Org A',
      slug: `scan-artifacts-org-a-${Date.now()}`,
      createdAt: new Date(),
    });

    projectAId = createId();
    await db.insert(projects).values({
      id: projectAId,
      organizationId: orgAId,
      name: 'Project A',
      isDefault: true,
      createdAt: new Date(),
    });

    deviceAId = createId();
    await db.insert(devices).values({
      id: deviceAId,
      organizationId: orgAId,
      projectId: projectAId,
      name: 'test-device-a.example.com',
      host: 'test-device-a.example.com',
      source: 'TEST',
      createdAt: new Date(),
    });

    scanRunAId = createId();
    await db.insert(scanRuns).values({
      id: scanRunAId,
      organizationId: orgAId,
      restateWorkflowId: `test-scan-a-${Date.now()}`,
      workflowKind: 'EXTEND_SCAN',
      scanType: 'PORT',
      scope: 'INTERNAL',
      status: 'SUCCEEDED',
      createdAt: new Date(),
    });

    // Create Organization B with Device B and Scan Run B
    orgBId = createId();
    await db.insert(organization).values({
      id: orgBId,
      name: 'Scan Artifacts Test Org B',
      slug: `scan-artifacts-org-b-${Date.now()}`,
      createdAt: new Date(),
    });

    projectBId = createId();
    await db.insert(projects).values({
      id: projectBId,
      organizationId: orgBId,
      name: 'Project B',
      isDefault: true,
      createdAt: new Date(),
    });

    deviceBId = createId();
    await db.insert(devices).values({
      id: deviceBId,
      organizationId: orgBId,
      projectId: projectBId,
      name: 'test-device-b.example.com',
      host: 'test-device-b.example.com',
      source: 'TEST',
      createdAt: new Date(),
    });

    scanRunBId = createId();
    await db.insert(scanRuns).values({
      id: scanRunBId,
      organizationId: orgBId,
      restateWorkflowId: `test-scan-b-${Date.now()}`,
      workflowKind: 'EXTEND_SCAN',
      scanType: 'PORT',
      scope: 'INTERNAL',
      status: 'SUCCEEDED',
      createdAt: new Date(),
    });

    console.log('✅ Scan artifacts test data created');
  });

  afterAll(async () => {
    const db = getDb();

    // Cleanup (order matters due to foreign key constraints)
    await db.delete(httpxTechDetections).where(eq(scanArtifacts.organizationId, orgAId));
    await db.delete(httpxTechDetections).where(eq(scanArtifacts.organizationId, orgBId));
    await db.delete(httpxProbes);
    await db.delete(scanArtifacts).where(eq(scanArtifacts.organizationId, orgAId));
    await db.delete(scanArtifacts).where(eq(scanArtifacts.organizationId, orgBId));
    await db.delete(technologies);
    await db.delete(scanRuns).where(eq(scanRuns.id, scanRunAId));
    await db.delete(scanRuns).where(eq(scanRuns.id, scanRunBId));
    await db.delete(devices).where(eq(devices.id, deviceAId));
    await db.delete(devices).where(eq(devices.id, deviceBId));
    await db.delete(projects).where(eq(projects.id, projectAId));
    await db.delete(projects).where(eq(projects.id, projectBId));
    await db.delete(organization).where(eq(organization.id, orgAId));
    await db.delete(organization).where(eq(organization.id, orgBId));

    console.log('🧹 Scan artifacts test data cleaned up');
  });

  describe('createScanArtifact', () => {
    it('should create artifact with all fields', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
        metadata: { url: 'http://test-device-a.example.com:80' },
      });

      expect(artifact).toBeDefined();
      expect(artifact.id).toBeTruthy();

      // Verify in database
      const db = getDb();
      const [stored] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(stored.scanRunId).toBe(scanRunAId);
      expect(stored.deviceId).toBe(deviceAId);
      expect(stored.organizationId).toBe(orgAId);
      expect(stored.toolName).toBe('httpx');
      expect(stored.port).toBe(80);
      expect(stored.status).toBe('completed');
      expect(stored.metadata).toEqual({ url: 'http://test-device-a.example.com:80' });
    });

    it('should create artifact without port (nullable field)', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'zap',
        status: 'pending',
      });

      expect(artifact.id).toBeTruthy();

      const db = getDb();
      const [stored] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(stored.port).toBeNull();
      expect(stored.toolName).toBe('zap');
    });

    it('should default status to pending if not provided', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 443,
      });

      const db = getDb();
      const [stored] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(stored.status).toBe('pending');
    });
  });

  describe('updateArtifactStatus', () => {
    it('should update status to running and set startedAt', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 8080,
        status: 'pending',
      });

      await updateArtifactStatus(artifact.id, 'running');

      const db = getDb();
      const [updated] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(updated.status).toBe('running');
      expect(updated.startedAt).toBeTruthy();
      expect(updated.completedAt).toBeNull();
    });

    it('should update status to completed and set completedAt', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 3000,
        status: 'running',
      });

      await updateArtifactStatus(artifact.id, 'completed');

      const db = getDb();
      const [updated] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeTruthy();
    });

    it('should update status to failed with error message', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 9000,
        status: 'running',
      });

      await updateArtifactStatus(artifact.id, 'failed', 'Connection timeout');

      const db = getDb();
      const [updated] = await db
        .select()
        .from(scanArtifacts)
        .where(eq(scanArtifacts.id, artifact.id));

      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Connection timeout');
      expect(updated.completedAt).toBeTruthy();
    });
  });

  describe('createHttpxProbe', () => {
    it('should create httpx probe with full data', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      const probe = await createHttpxProbe({
        artifactId: artifact.id,
        scheme: 'http',
        statusCode: 200,
        title: 'Test Page',
        headers: { 'content-type': 'text/html', 'server': 'nginx/1.24.0' },
        responseTime: 125,
        contentLength: 4096,
        finalUrl: 'http://test-device-a.example.com/',
        tlsVersion: undefined,
        webServer: 'nginx',
      });

      expect(probe.id).toBeTruthy();

      const db = getDb();
      const [stored] = await db
        .select()
        .from(httpxProbes)
        .where(eq(httpxProbes.id, probe.id));

      expect(stored.artifactId).toBe(artifact.id);
      expect(stored.scheme).toBe('http');
      expect(stored.statusCode).toBe(200);
      expect(stored.title).toBe('Test Page');
      expect(stored.headers).toEqual({ 'content-type': 'text/html', 'server': 'nginx/1.24.0' });
      expect(stored.responseTime).toBe(125);
      expect(stored.webServer).toBe('nginx');
    });

    it('should enforce unique constraint on artifactId', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 443,
        status: 'completed',
      });

      await createHttpxProbe({
        artifactId: artifact.id,
        scheme: 'https',
        statusCode: 200,
      });

      // Try to create another probe for same artifact
      await expect(
        createHttpxProbe({
          artifactId: artifact.id,
          scheme: 'https',
          statusCode: 200,
        })
      ).rejects.toThrow();
    });
  });

  describe('findOrCreateTechnology', () => {
    it('should create new technology with normalized name', async () => {
      const techId = await findOrCreateTechnology('Nginx', 'web-server');

      expect(techId).toBeTruthy();

      const db = getDb();
      const [tech] = await db
        .select()
        .from(technologies)
        .where(eq(technologies.id, techId));

      expect(tech.name).toBe('nginx'); // Normalized to lowercase
      expect(tech.category).toBe('web-server');
    });

    it('should return existing technology ID for duplicate names', async () => {
      // Create technology
      const techId1 = await findOrCreateTechnology('React', 'framework');

      // Try to create same technology (different casing)
      const techId2 = await findOrCreateTechnology('react', 'framework');
      const techId3 = await findOrCreateTechnology('REACT', 'framework');

      expect(techId1).toBe(techId2);
      expect(techId1).toBe(techId3);

      // Verify only one row exists
      const db = getDb();
      const rows = await db
        .select()
        .from(technologies)
        .where(eq(technologies.name, 'react'));

      expect(rows.length).toBe(1);
    });

    it('should handle technology without category', async () => {
      const techId = await findOrCreateTechnology('UnknownTech');

      const db = getDb();
      const [tech] = await db
        .select()
        .from(technologies)
        .where(eq(technologies.id, techId));

      expect(tech.name).toBe('unknowntech');
      expect(tech.category).toBeNull();
    });
  });

  describe('createTechDetection', () => {
    it('should create technology detection with all fields', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      const probe = await createHttpxProbe({
        artifactId: artifact.id,
        scheme: 'http',
        statusCode: 200,
      });

      const techId = await findOrCreateTechnology('vue', 'framework');

      await createTechDetection({
        probeId: probe.id,
        technologyId: techId,
        confidence: 'high',
        version: '3.4.0',
      });

      const db = getDb();
      const detections = await db
        .select()
        .from(httpxTechDetections)
        .where(eq(httpxTechDetections.probeId, probe.id));

      expect(detections.length).toBe(1);
      expect(detections[0].technologyId).toBe(techId);
      expect(detections[0].confidence).toBe('high');
      expect(detections[0].version).toBe('3.4.0');
    });

    it('should enforce unique constraint on probeId + technologyId', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 8080,
        status: 'completed',
      });

      const probe = await createHttpxProbe({
        artifactId: artifact.id,
        scheme: 'http',
        statusCode: 200,
      });

      const techId = await findOrCreateTechnology('angular', 'framework');

      await createTechDetection({
        probeId: probe.id,
        technologyId: techId,
        confidence: 'medium',
        version: '17.0.0',
      });

      // Try to create duplicate detection (should be ignored)
      await createTechDetection({
        probeId: probe.id,
        technologyId: techId,
        confidence: 'high',
        version: '17.0.1',
      });

      const db = getDb();
      const detections = await db
        .select()
        .from(httpxTechDetections)
        .where(and(
          eq(httpxTechDetections.probeId, probe.id),
          eq(httpxTechDetections.technologyId, techId)
        ));

      // Should only have one row (duplicate was ignored)
      expect(detections.length).toBe(1);
      expect(detections[0].version).toBe('17.0.0'); // Original version
    });
  });

  describe('getDeviceArtifacts - Happy Path', () => {
    it('should return artifacts with httpx probes and technologies', async () => {
      // Create artifact
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      // Create probe
      const probe = await createHttpxProbe({
        artifactId: artifact.id,
        scheme: 'http',
        statusCode: 200,
        title: 'Homepage',
        webServer: 'nginx',
      });

      // Create technologies
      const nginxId = await findOrCreateTechnology('nginx', 'web-server');
      const reactId = await findOrCreateTechnology('react', 'framework');

      await createTechDetection({
        probeId: probe.id,
        technologyId: nginxId,
        confidence: 'high',
        version: '1.24.0',
      });

      await createTechDetection({
        probeId: probe.id,
        technologyId: reactId,
        confidence: 'medium',
        version: '18.2.0',
      });

      // Query artifacts
      const results = await getDeviceArtifacts(deviceAId, orgAId);

      expect(results.length).toBeGreaterThan(0);

      const result = results.find(r => r.artifact.id === artifact.id);
      expect(result).toBeDefined();
      expect(result!.httpxProbe).toBeDefined();
      expect(result!.httpxProbe!.statusCode).toBe(200);
      expect(result!.httpxProbe!.title).toBe('Homepage');
      expect(result!.technologies.length).toBe(2);

      const nginxTech = result!.technologies.find(t => t.name === 'nginx');
      expect(nginxTech).toBeDefined();
      expect(nginxTech!.version).toBe('1.24.0');
      expect(nginxTech!.confidence).toBe('high');
    });

    it('should filter by toolName', async () => {
      // Create httpx artifact
      const httpxArtifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 443,
        status: 'completed',
      });

      // Create zap artifact
      const zapArtifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'zap',
        status: 'completed',
      });

      // Query only httpx artifacts
      const results = await getDeviceArtifacts(deviceAId, orgAId, { toolName: 'httpx' });

      const httpxResults = results.filter(r => r.artifact.toolName === 'httpx');
      const zapResults = results.filter(r => r.artifact.toolName === 'zap');

      expect(httpxResults.length).toBeGreaterThan(0);
      expect(zapResults.length).toBe(0); // Filtered out
    });

    it('should return empty array for device with no artifacts', async () => {
      // Create a new device with no artifacts
      const db = getDb();
      const emptyDeviceId = createId();
      await db.insert(devices).values({
        id: emptyDeviceId,
        organizationId: orgAId,
        projectId: projectAId,
        name: 'empty-device.example.com',
        host: 'empty-device.example.com',
        source: 'TEST',
        createdAt: new Date(),
      });

      const results = await getDeviceArtifacts(emptyDeviceId, orgAId);

      expect(results).toEqual([]);

      // Cleanup
      await db.delete(devices).where(eq(devices.id, emptyDeviceId));
    });
  });

  describe('getDeviceArtifacts - Security', () => {
    it('should block cross-org device access', async () => {
      // Try to access Device A from Org B context
      await expect(
        getDeviceArtifacts(deviceAId, orgBId)
      ).rejects.toThrow('Device not found or access denied');
    });

    it('should allow access to own organization device', async () => {
      const results = await getDeviceArtifacts(deviceAId, orgAId);
      expect(results).toBeInstanceOf(Array);
    });
  });

  describe('getArtifactsForScanRun', () => {
    it('should return all artifacts for a scan run', async () => {
      // Create multiple artifacts for same scan
      const artifact1 = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      const artifact2 = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 443,
        status: 'completed',
      });

      const results = await getArtifactsForScanRun(scanRunAId, orgAId);

      expect(results.length).toBeGreaterThanOrEqual(2);

      const ports = results.map(r => r.artifact.port);
      expect(ports).toContain(80);
      expect(ports).toContain(443);
    });

    it('should block cross-org scan run access', async () => {
      await expect(
        getArtifactsForScanRun(scanRunAId, orgBId)
      ).rejects.toThrow('Scan run not found or access denied');
    });
  });

  describe('getTechnologyStats', () => {
    it('should aggregate technology statistics', async () => {
      // Create artifacts for Device A with nginx
      const artifact1 = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      const probe1 = await createHttpxProbe({ artifactId: artifact1.id, statusCode: 200 });
      const nginxId = await findOrCreateTechnology('nginx', 'web-server');
      await createTechDetection({ probeId: probe1.id, technologyId: nginxId, confidence: 'high' });

      // Create another artifact on same device, different port
      const artifact2 = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 8080,
        status: 'completed',
      });

      const probe2 = await createHttpxProbe({ artifactId: artifact2.id, statusCode: 200 });
      await createTechDetection({ probeId: probe2.id, technologyId: nginxId, confidence: 'high' });

      const stats = await getTechnologyStats(orgAId);

      const nginxStat = stats.find(s => s.name === 'nginx');
      expect(nginxStat).toBeDefined();
      expect(nginxStat!.category).toBe('web-server');
      expect(nginxStat!.deviceCount).toBeGreaterThanOrEqual(1);
      expect(nginxStat!.portCount).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for org with no technologies', async () => {
      const stats = await getTechnologyStats(orgBId);
      expect(stats).toEqual([]);
    });
  });

  describe('getDevicesByTechnology', () => {
    it('should find devices running specific technology', async () => {
      // Create device with WordPress
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 80,
        status: 'completed',
      });

      const probe = await createHttpxProbe({ artifactId: artifact.id, statusCode: 200 });
      const wpId = await findOrCreateTechnology('wordpress', 'cms');
      await createTechDetection({ probeId: probe.id, technologyId: wpId, confidence: 'high', version: '6.4.0' });

      const devices = await getDevicesByTechnology(orgAId, 'wordpress');

      expect(devices.length).toBeGreaterThanOrEqual(1);

      const device = devices.find(d => d.deviceId === deviceAId);
      expect(device).toBeDefined();
      expect(device!.ports).toContain(80);
    });

    it('should handle case-insensitive technology search', async () => {
      const artifact = await createScanArtifact({
        scanRunId: scanRunAId,
        deviceId: deviceAId,
        organizationId: orgAId,
        toolName: 'httpx',
        port: 443,
        status: 'completed',
      });

      const probe = await createHttpxProbe({ artifactId: artifact.id, statusCode: 200 });
      const phpId = await findOrCreateTechnology('php', 'language');
      await createTechDetection({ probeId: probe.id, technologyId: phpId, confidence: 'high' });

      // Search with different casing
      const devicesLower = await getDevicesByTechnology(orgAId, 'php');
      const devicesUpper = await getDevicesByTechnology(orgAId, 'PHP');
      const devicesMixed = await getDevicesByTechnology(orgAId, 'PhP');

      expect(devicesLower.length).toBe(devicesUpper.length);
      expect(devicesLower.length).toBe(devicesMixed.length);
    });

    it('should return empty array for technology not found', async () => {
      const devices = await getDevicesByTechnology(orgAId, 'nonexistent-tech');
      expect(devices).toEqual([]);
    });
  });
});
