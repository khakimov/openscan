import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../database/setup';
import {
  scanArtifacts,
  httpxProbes,
  technologies,
  httpxTechDetections,
  scanRuns,
} from '../schema/orchestration';
import { devices } from '../schema/inventory';
import { createId } from '@paralleldrive/cuid2';

/**
 * Scan artifact status type
 */
export type ArtifactStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Create a scan artifact (canonical metadata record)
 */
export async function createScanArtifact(params: {
  scanRunId: string;
  deviceId: string;
  organizationId: string;
  toolName: string;
  port?: number;
  status?: ArtifactStatus;
  metadata?: Record<string, any>;
}): Promise<{ id: string }> {
  const db = getDb();

  const [artifact] = await db
    .insert(scanArtifacts)
    .values({
      id: createId(),
      scanRunId: params.scanRunId,
      deviceId: params.deviceId,
      organizationId: params.organizationId,
      toolName: params.toolName,
      port: params.port,
      status: params.status || 'pending',
      metadata: params.metadata,
      startedAt: params.status === 'running' ? new Date() : null,
    })
    .returning({ id: scanArtifacts.id });

  return artifact;
}

/**
 * Update scan artifact status
 */
export async function updateArtifactStatus(
  artifactId: string,
  status: ArtifactStatus,
  errorMessage?: string
): Promise<void> {
  const db = getDb();

  const updates: any = {
    status,
  };

  if (status === 'running') {
    updates.startedAt = new Date();
  }
  if (status === 'completed' || status === 'failed') {
    updates.completedAt = new Date();
  }
  if (errorMessage) {
    updates.errorMessage = errorMessage;
  }

  await db
    .update(scanArtifacts)
    .set(updates)
    .where(eq(scanArtifacts.id, artifactId));
}

/**
 * Create httpx probe result
 */
export async function createHttpxProbe(params: {
  artifactId: string;
  scheme?: string;
  statusCode?: number;
  title?: string;
  screenshot?: string;
  headers?: Record<string, string>;
  responseTime?: number;
  contentLength?: number;
  finalUrl?: string;
  tlsVersion?: string;
  webServer?: string;
}): Promise<{ id: string }> {
  const db = getDb();

  // Build metadata object for low-value fields
  const metadata: Record<string, any> = {};
  if (params.headers) metadata.headers = params.headers;
  if (params.tlsVersion) metadata.tlsVersion = params.tlsVersion;
  if (params.contentLength !== undefined) metadata.contentLength = params.contentLength;
  if (params.finalUrl) metadata.finalUrl = params.finalUrl;

  const [probe] = await db
    .insert(httpxProbes)
    .values({
      id: createId(),
      artifactId: params.artifactId,
      // Typed columns (frequently queried)
      scheme: params.scheme,
      statusCode: params.statusCode,
      title: params.title,
      screenshot: params.screenshot,
      responseTime: params.responseTime,
      webServer: params.webServer,
      // Low-value fields in metadata JSON
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    })
    .returning({ id: httpxProbes.id });

  return probe;
}

/**
 * Find or create technology (normalized name)
 */
export async function findOrCreateTechnology(
  name: string,
  category?: string
): Promise<string> {
  const db = getDb();
  const normalizedName = name.toLowerCase();

  // Try to find existing technology
  const [existing] = await db
    .select()
    .from(technologies)
    .where(eq(technologies.name, normalizedName))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  // Create new technology
  const [newTech] = await db
    .insert(technologies)
    .values({
      id: createId(),
      name: normalizedName,
      category,
    })
    .returning({ id: technologies.id });

  return newTech.id;
}

/**
 * Create technology detection for httpx probe
 */
export async function createTechDetection(params: {
  probeId: string;
  technologyId: string;
  confidence?: 'high' | 'medium' | 'low';
  version?: string;
}): Promise<void> {
  const db = getDb();

  await db
    .insert(httpxTechDetections)
    .values({
      id: createId(),
      probeId: params.probeId,
      technologyId: params.technologyId,
      confidence: params.confidence,
      version: params.version,
    })
    .onConflictDoNothing();
}

/**
 * Get scan artifacts for a device with httpx probes and tech detections
 */
export async function getDeviceArtifacts(
  deviceId: string,
  organizationId: string,
  options?: {
    toolName?: string;
    limit?: number;
  }
): Promise<
  Array<{
    artifact: typeof scanArtifacts.$inferSelect;
    httpxProbe: (typeof httpxProbes.$inferSelect) | null;
    technologies: Array<{
      id: string;
      name: string;
      category: string | null;
      version: string | null;
      confidence: string | null;
    }>;
  }>
> {
  const db = getDb();

  // First, verify device belongs to organization (security check)
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.organizationId, organizationId)))
    .limit(1);

  if (!device) {
    throw new Error('Device not found or access denied');
  }

  // Build query conditions
  const conditions = [
    eq(scanArtifacts.deviceId, deviceId),
    eq(scanArtifacts.organizationId, organizationId),
  ];

  if (options?.toolName) {
    conditions.push(eq(scanArtifacts.toolName, options.toolName));
  }

  // Get artifacts with httpx probes
  const artifacts = await db
    .select({
      artifact: scanArtifacts,
      httpxProbe: httpxProbes,
    })
    .from(scanArtifacts)
    .leftJoin(httpxProbes, eq(httpxProbes.artifactId, scanArtifacts.id))
    .where(and(...conditions))
    .orderBy(desc(scanArtifacts.createdAt))
    .limit(options?.limit || 100);

  // Get tech detections for each probe
  const results = await Promise.all(
    artifacts.map(async (row: { artifact: typeof scanArtifacts.$inferSelect; httpxProbe: typeof httpxProbes.$inferSelect | null }) => {
      const { artifact, httpxProbe } = row;

      if (!httpxProbe) {
        return {
          artifact,
          httpxProbe: null,
          technologies: [],
        };
      }

      const techs = await db
        .select({
          id: technologies.id,
          name: technologies.name,
          category: technologies.category,
          version: httpxTechDetections.version,
          confidence: httpxTechDetections.confidence,
        })
        .from(httpxTechDetections)
        .innerJoin(technologies, eq(technologies.id, httpxTechDetections.technologyId))
        .where(eq(httpxTechDetections.probeId, httpxProbe.id));

      return {
        artifact,
        httpxProbe,
        technologies: techs,
      };
    })
  );

  return results;
}

/**
 * Get artifacts for a scan run
 */
export async function getArtifactsForScanRun(
  scanRunId: string,
  organizationId: string
): Promise<
  Array<{
    artifact: typeof scanArtifacts.$inferSelect;
    httpxProbe: (typeof httpxProbes.$inferSelect) | null;
  }>
> {
  const db = getDb();

  // Verify scan run belongs to organization (security check)
  const [scanRun] = await db
    .select()
    .from(scanRuns)
    .where(and(eq(scanRuns.id, scanRunId), eq(scanRuns.organizationId, organizationId)))
    .limit(1);

  if (!scanRun) {
    throw new Error('Scan run not found or access denied');
  }

  const results = await db
    .select({
      artifact: scanArtifacts,
      httpxProbe: httpxProbes,
    })
    .from(scanArtifacts)
    .leftJoin(httpxProbes, eq(httpxProbes.artifactId, scanArtifacts.id))
    .where(
      and(
        eq(scanArtifacts.scanRunId, scanRunId),
        eq(scanArtifacts.organizationId, organizationId)
      )
    )
    .orderBy(scanArtifacts.port);

  return results;
}

/**
 * Get technology statistics across organization
 */
export async function getTechnologyStats(organizationId: string): Promise<
  Array<{
    name: string;
    category: string | null;
    deviceCount: number;
    portCount: number;
  }>
> {
  const db = getDb();

  const stats = await db
    .select({
      name: technologies.name,
      category: technologies.category,
      deviceCount: sql<number>`COUNT(DISTINCT ${scanArtifacts.deviceId})`,
      portCount: sql<number>`COUNT(DISTINCT ${scanArtifacts.id})`,
    })
    .from(technologies)
    .innerJoin(httpxTechDetections, eq(httpxTechDetections.technologyId, technologies.id))
    .innerJoin(httpxProbes, eq(httpxProbes.id, httpxTechDetections.probeId))
    .innerJoin(scanArtifacts, eq(scanArtifacts.id, httpxProbes.artifactId))
    .where(eq(scanArtifacts.organizationId, organizationId))
    .groupBy(technologies.id, technologies.name, technologies.category)
    .orderBy(desc(sql`COUNT(DISTINCT ${scanArtifacts.deviceId})`));

  return stats;
}

/**
 * Search devices by technology
 */
export async function getDevicesByTechnology(
  organizationId: string,
  technologyName: string
): Promise<
  Array<{
    deviceId: string;
    deviceName: string | null;
    ports: number[];
  }>
> {
  const db = getDb();
  const normalizedName = technologyName.toLowerCase();

  const results = await db
    .select({
      deviceId: scanArtifacts.deviceId,
      deviceName: devices.name,
      port: scanArtifacts.port,
    })
    .from(technologies)
    .innerJoin(httpxTechDetections, eq(httpxTechDetections.technologyId, technologies.id))
    .innerJoin(httpxProbes, eq(httpxProbes.id, httpxTechDetections.probeId))
    .innerJoin(scanArtifacts, eq(scanArtifacts.id, httpxProbes.artifactId))
    .innerJoin(devices, eq(devices.id, scanArtifacts.deviceId))
    .where(
      and(
        eq(technologies.name, normalizedName),
        eq(scanArtifacts.organizationId, organizationId)
      )
    );

  // Group by device and collect ports
  const deviceMap = new Map<string, { deviceName: string | null; ports: number[] }>();

  for (const row of results) {
    if (!deviceMap.has(row.deviceId)) {
      deviceMap.set(row.deviceId, {
        deviceName: row.deviceName,
        ports: [],
      });
    }
    if (row.port !== null) {
      deviceMap.get(row.deviceId)!.ports.push(row.port);
    }
  }

  return Array.from(deviceMap.entries()).map(([deviceId, data]) => ({
    deviceId,
    deviceName: data.deviceName,
    ports: data.ports,
  }));
}
