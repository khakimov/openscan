import { eq, desc, asc, and, or, inArray, sql, SQL } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { devices, deviceIps, deviceTags, tags, scanRuns, scanRunDevices, scanSchedules, projects, scanArtifacts, httpxProbes, httpxTechDetections, technologies, notifications } from '../schema';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { derivePortStats } from '../types/cve-enrichment';
import {
  normalizeNmap,
  normalizeHttpx,
  resolveService,
  type NmapServiceDetection,
  type HttpxProbeData,
} from '@repo/contracts/device/resolvers';
import { createServerPromotedNotification } from '../notifications/catalog';
import { resolveAndUpsertTargets } from './devices/resolution';

// Helper: Convert D1 timestamp_ms (number | null) to Date | undefined
function toDateOrUndefined(timestamp: number | null | undefined): Date | undefined {
  return (timestamp !== null && timestamp !== undefined) ? new Date(timestamp) : undefined;
}

// ============================================================================
// Schema Contracts (Generated from Drizzle + Validation Overrides)
// ============================================================================

/**
 * Schema for creating devices from UI flows (modals, onboarding, etc.)
 *
 * Key requirement: projectId is REQUIRED
 * Use this when users are explicitly creating devices in a project context.
 */
export const CreateDevicesInProjectSchema = z.object({
  targets: z.array(z.object({
    host: z.string().min(1, 'Host is required'),
    ip: z.string().optional(),  // IP validation happens at data-ops layer
  })).min(1, 'At least one target is required'),
  projectId: z.string().optional(),
  organizationId: z.string().optional(),
  options: z.object({
    source: z.string().optional(),
    scope: z.enum(['INTERNAL', 'EXTERNAL', 'HYBRID']).optional(),
    verificationStatus: z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']).optional(),
  }).optional(),
}).refine(
  (data) => typeof data.projectId === 'string' && data.projectId.length > 0,
  {
    message: 'Project ID is required',
    path: ['projectId'],
  }
).refine(
  (data) => typeof data.organizationId === 'string' && data.organizationId.length > 0,
  {
    message: 'Organization ID is required',
    path: ['organizationId'],
  }
).transform((data) => ({
  ...data,
  projectId: data.projectId as string,  // Safe: refine guarantees this is string
  organizationId: data.organizationId as string,  // Safe: refine guarantees this is string
}));

export type CreateDevicesInProjectInput = z.infer<typeof CreateDevicesInProjectSchema>;

/**
 * Schema for creating devices from discovery/worker flows
 *
 * Key difference: projectId is OPTIONAL
 * Use this for automated ingestion where devices may not belong to a project yet.
 */
export const CreateDevicesFromDiscoverySchema = z.object({
  targets: z.array(z.object({
    host: z.string().min(1, 'Host is required'),
    ip: z.string().optional(),  // IP validation happens at data-ops layer
  })).min(1, 'At least one target is required'),
  projectId: z.string().min(1).optional().nullable(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  options: z.object({
    source: z.string().optional(),
    scope: z.enum(['INTERNAL', 'EXTERNAL', 'HYBRID']).optional(),
    verificationStatus: z.enum(['CANDIDATE', 'VERIFIED', 'EXCLUDED']).optional(),
  }).optional(),
});

export type CreateDevicesFromDiscoveryInput = z.infer<typeof CreateDevicesFromDiscoverySchema>;

// ============================================================================
// Device Creation Functions
// ============================================================================

/**
 * Create devices from UI flows (modals, onboarding)
 *
 * This is the STRICT version that REQUIRES projectId.
 * Use this when users are explicitly creating devices in a project context.
 *
 * @throws {ZodError} If input validation fails
 * @throws {Error} If project not found or access denied
 */
export async function createDevicesInProject(
  input: CreateDevicesInProjectInput
) {
  // ✅ Runtime validation (throws ZodError if invalid)
  const validated = CreateDevicesInProjectSchema.parse(input);

  // Delegate to the underlying implementation
  return createMultipleDevicesFromDiscovery(
    validated.targets,
    validated.organizationId,
    {
      projectId: validated.projectId,  // ✅ TypeScript guarantees this is defined
      source: validated.options?.source,
      scope: validated.options?.scope,
      verificationStatus: validated.options?.verificationStatus,
    }
  );
}

// Types
export type DeviceQueryParams = {
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | Array<'CANDIDATE' | 'VERIFIED' | 'EXCLUDED'>;
  projectId?: string; // Filter by project
};

export type DeviceUpdateData = {
  name?: string;
  ip?: string;
  projectId?: string | null;
  riskLevel?: string;
  state?: string;
  scope?: string;
  source?: string;
  isScanned?: boolean;
  respondsToPing?: boolean;
  tags?: string[];
  notes?: string;
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  verifiedAt?: Date;
  verifiedBy?: string;
  verificationNote?: string | null;
};

/**
 * Get all devices for a tenant with pagination and filtering
 */
export async function getDevicesForTenant(
  organizationId: string,
  params: DeviceQueryParams = {}
) {
  const db = getDb();
  const {
    page = 1,
    pageSize = 50,
    sortColumn = 'discoveredAt',
    sortDirection = 'desc',
    verificationStatus,
  } = params;

  // Build WHERE conditions
  const whereConditions: SQL[] = [eq(devices.organizationId, organizationId)];

  // Filter by project if specified
  if (params.projectId) {
    whereConditions.push(eq(devices.projectId, params.projectId));
  }

  if (verificationStatus) {
    if (Array.isArray(verificationStatus)) {
      whereConditions.push(inArray(devices.verificationStatus, verificationStatus));
    } else {
      whereConditions.push(eq(devices.verificationStatus, verificationStatus));
    }
  }

  const where = and(...whereConditions);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(devices)
    .where(where);

  const totalCount = Number(countResult[0]?.count || 0);

  // Build sort - default to discoveredAt if invalid column
  let sortField = devices.discoveredAt;
  if (sortColumn && sortColumn in devices) {
    const field = devices[sortColumn as keyof typeof devices];
    // Check if it's a column (has a property that indicates it's a column object)
    if (typeof field === 'object' && field !== null && 'name' in field) {
      sortField = field as any;
    }
  }

  const sortOrder = sortDirection === 'asc' ? asc : desc;

  // Get paginated devices
  const offset = (page - 1) * pageSize;
  const deviceList = await db
    .select()
    .from(devices)
    .where(where)
    .orderBy(sortOrder(sortField))
    .limit(pageSize)
    .offset(offset);

  // Get primary IPs for each device
  const deviceIds = deviceList.map((d: any) => d.id);
  const ips = deviceIds.length > 0
    ? await db
        .select()
        .from(deviceIps)
        .where(and(
          inArray(deviceIps.deviceId, deviceIds),
          eq(deviceIps.primary, sql`1`)
        ))
    : [];

  // Get tags for each device
  const deviceTagsData = deviceIds.length > 0
    ? await db
        .select({
          deviceId: deviceTags.deviceId,
          tag: tags,
        })
        .from(deviceTags)
        .innerJoin(tags, eq(deviceTags.tagId, tags.id))
        .where(inArray(deviceTags.deviceId, deviceIds))
    : [];

  // Map IPs and tags to devices
  const ipMap = new Map(ips.map((ip: any) => [ip.deviceId, ip.ip]));
  const tagsMap = new Map<string, string[]>();
  deviceTagsData.forEach(({ deviceId, tag }: any) => {
    if (!tagsMap.has(deviceId)) tagsMap.set(deviceId, []);
    tagsMap.get(deviceId)!.push(tag.name);
  });

  // Get scan statistics for each device using junction table
  const scanStatsMap = new Map();
  if (deviceIds.length > 0) {
    // Get scan stats per device using junction table
    const scanStats = await db
      .select({
        deviceId: scanRunDevices.deviceId,
        scanCount: sql<number>`count(*)`.as('scan_count'),
        lastScanAt: sql<number>`max(${scanRuns.completedAt})`.as('last_scan_at'),
      })
      .from(scanRuns)
      .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
      .where(and(
        inArray(scanRunDevices.deviceId, deviceIds),
        eq(scanRuns.organizationId, organizationId),
        eq(scanRuns.status, 'SUCCEEDED')
      ))
      .groupBy(scanRunDevices.deviceId);

    // Get latest scan details for each device
    // Optimization: Only fetch recent scans (last 30 days) to reduce data transfer
    // then pick latest per device in JS. This handles 99% of use cases efficiently.
    const latestScanMap = new Map();
    if (deviceIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const recentScans = await db
        .select({
          deviceId: scanRunDevices.deviceId,
          resultSummary: scanRuns.resultSummary,
          completedAt: scanRuns.completedAt,
        })
        .from(scanRuns)
        .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
        .where(and(
          inArray(scanRunDevices.deviceId, deviceIds),
          eq(scanRuns.organizationId, organizationId),
          eq(scanRuns.status, 'SUCCEEDED'),
          // Only fetch scans from last 30 days - dramatically reduces data transfer
          // If no scan in 30 days, device just won't have port snapshots (acceptable)
          sql`${scanRuns.completedAt} > ${thirtyDaysAgo.getTime()}`
        ))
        .orderBy(desc(scanRuns.completedAt))
        .limit(500); // Hard limit as safety valve

      // Pick the first (latest) scan for each device
      for (const scan of recentScans) {
        if (!latestScanMap.has(scan.deviceId)) {
          latestScanMap.set(scan.deviceId, scan);
        }
      }
    }

    // Build scan stats map
    for (const stat of scanStats) {
      const latestScan = latestScanMap.get(stat.deviceId);
      const resultSummary = latestScan?.resultSummary as any;

      // ✅ Derive port stats from canonical portSnapshots (sec-zg2)
      const portStats = derivePortStats(
        resultSummary?.portSnapshots,
        resultSummary?.portScanStats
      );

      scanStatsMap.set(stat.deviceId, {
        scanCount: Number(stat.scanCount),
        totalScans: Number(stat.scanCount),
        lastScanAt: toDateOrUndefined(stat.lastScanAt),
        // Nest port metadata under portScanStats (aligns with TransformedDevice type)
        portScanStats: {
          totalOpenPorts: portStats.totalOpenPorts,
          portsWithService: portStats.portsWithService,
          portsStored: portStats.portsStored,
          serviceDetectionRate: portStats.serviceDetectionRate,
          suspiciousAllPortsOpen: portStats.suspiciousAllPortsOpen,
          scanPattern: portStats.scanPattern,
        },
        // Expose portSnapshots directly from result_summary (single source of truth)
        portSnapshots: resultSummary?.portSnapshots || [],
      });
    }
  }

  // Combine data
  const items = deviceList.map((device: any) => ({
    ...device,
    ip: ipMap.get(device.id) || null,
    tags: tagsMap.get(device.id) || [],
    scanStats: scanStatsMap.get(device.id) || undefined,
  }));

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

/**
 * Get a single device by ID for a tenant
 */
export async function getDeviceById(deviceId: string, organizationId: string) {
  const db = getDb();

  const [device] = await db
    .select()
    .from(devices)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.organizationId, organizationId)
    ))
    .limit(1);

  if (!device) return null;

  // Get primary IP
  const [primaryIp] = await db
    .select()
    .from(deviceIps)
    .where(and(
      eq(deviceIps.deviceId, deviceId),
      eq(deviceIps.primary, sql`1`)
    ))
    .limit(1);

  // Get tags
  const deviceTagsData = await db
    .select({ tag: tags })
    .from(deviceTags)
    .innerJoin(tags, eq(deviceTags.tagId, tags.id))
    .where(eq(deviceTags.deviceId, deviceId));

  // Get scan statistics using junction table (proper device-to-scan relationship)
  const scanStatsResult = await db
    .select({
      scanCount: sql<number>`count(*)`.as('scan_count'),
      lastScanAt: sql<number>`max(${scanRuns.completedAt})`.as('last_scan_at'),
    })
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(
      eq(scanRunDevices.deviceId, deviceId),
      eq(scanRuns.organizationId, organizationId),
      eq(scanRuns.status, 'SUCCEEDED')
    ));

  // Get the latest scan's result summary for port information
  const latestScan = await db
    .select({
      scanRunId: scanRuns.id,
      resultSummary: scanRuns.resultSummary,
    })
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(
      eq(scanRunDevices.deviceId, deviceId),
      eq(scanRuns.organizationId, organizationId),
      eq(scanRuns.status, 'SUCCEEDED')
    ))
    .orderBy(desc(scanRuns.completedAt))
    .limit(1);

  let deviceScanStats = undefined;
  if (scanStatsResult.length > 0 && scanStatsResult[0].scanCount > 0 && scanStatsResult[0].lastScanAt !== null) {
    const stat = scanStatsResult[0];
    const resultSummary = latestScan[0]?.resultSummary as any;

    // ✅ Derive port stats from canonical portSnapshots (sec-zg2)
    const portStats = derivePortStats(
      resultSummary?.portSnapshots,
      resultSummary?.portScanStats
    );

    // Fetch httpx probes for this device's latest scan
    let httpxProbesMap = new Map();
    if (latestScan[0]?.scanRunId) {
      const httpxProbesData = await db
        .select({
          port: scanArtifacts.port,
          scheme: httpxProbes.scheme,
          statusCode: httpxProbes.statusCode,
          title: httpxProbes.title,
          screenshot: httpxProbes.screenshot,
          responseTime: httpxProbes.responseTime,
          webServer: httpxProbes.webServer,
          metadata: httpxProbes.metadata,
          techName: technologies.name,
          techConfidence: httpxTechDetections.confidence,
          techVersion: httpxTechDetections.version,
        })
        .from(scanArtifacts)
        .innerJoin(httpxProbes, eq(scanArtifacts.id, httpxProbes.artifactId))
        .leftJoin(httpxTechDetections, eq(httpxProbes.id, httpxTechDetections.probeId))
        .leftJoin(technologies, eq(httpxTechDetections.technologyId, technologies.id))
        .where(and(
          eq(scanArtifacts.scanRunId, latestScan[0].scanRunId),
          eq(scanArtifacts.deviceId, deviceId),
          eq(scanArtifacts.toolName, 'httpx')
        ));

      // Group technologies by port
      for (const probe of httpxProbesData) {
        if (!httpxProbesMap.has(probe.port)) {
          httpxProbesMap.set(probe.port, {
            scheme: probe.scheme,
            statusCode: probe.statusCode,
            title: probe.title,
            screenshot: probe.screenshot,
            responseTime: probe.responseTime,
            webServer: probe.webServer,
            metadata: probe.metadata,
            technologies: [],
          });
        }

        // Add technology if present
        if (probe.techName) {
          httpxProbesMap.get(probe.port).technologies.push({
            name: probe.techName,
            confidence: probe.techConfidence,
            version: probe.techVersion,
          });
        }
      }
    }

    // Merge httpx data into ports array
    const portsWithHttpx = portStats.ports.map((port: any) => ({
      ...port,
      httpxProbe: httpxProbesMap.get(port.port) || undefined,
    }));

    deviceScanStats = {
      scanCount: Number(stat.scanCount),
      totalScans: Number(stat.scanCount),
      lastScanAt: toDateOrUndefined(stat.lastScanAt),
      // Nest port metadata under portScanStats (aligns with TransformedDevice type)
      portScanStats: {
        totalOpenPorts: portStats.totalOpenPorts,
        portsWithService: portStats.portsWithService,
        portsStored: portStats.portsStored,
        serviceDetectionRate: portStats.serviceDetectionRate,
        suspiciousAllPortsOpen: portStats.suspiciousAllPortsOpen,
        scanPattern: portStats.scanPattern,
      },
      // Expose portSnapshots directly from result_summary (single source of truth)
      // Merge in httpxProbe data and resolve service detection conflicts
      portSnapshots: (resultSummary?.portSnapshots || []).map((snapshot: any) => {
        const httpxProbe = httpxProbesMap.get(snapshot.port);

        // Collect evidence from all sources
        const evidence = [
          normalizeNmap(snapshot.service as NmapServiceDetection | null, snapshot.port),
          normalizeHttpx(httpxProbe as HttpxProbeData | null),
        ].filter((e): e is NonNullable<typeof e> => e !== null);

        // Resolve to single service determination
        const { resolved, allEvidence } = resolveService(evidence);

        return {
          ...snapshot,
          httpxProbe: httpxProbe || undefined,
          // Override service with resolved determination
          service: resolved ? {
            name: resolved.displayName,
            confidence: resolved.confidence,
            quality: resolved.quality,
            source: resolved.kind,
            resolvedFrom: resolved.resolvedFrom,
            suppressed: resolved.suppressed,
            resolvedAt: resolved.resolvedAt,
            // Preserve original Nmap metadata for debugging
            _originalNmap: snapshot.service,
          } : snapshot.service,
          // Preserve all evidence for analytics/debugging
          _evidence: allEvidence,
          // Transform metadata timestamps to Unix milliseconds for UI compatibility
          lastSeen: snapshot.metadata?.lastSeenAt
            ? new Date(snapshot.metadata.lastSeenAt).getTime()
            : undefined,
          firstSeen: snapshot.metadata?.firstSeenAt
            ? new Date(snapshot.metadata.firstSeenAt).getTime()
            : undefined,
        };
      }),
    };
  }

  return {
    ...device,
    ip: primaryIp?.ip || null,
    tags: deviceTagsData.map(({ tag }: any) => tag.name),
    scanStats: deviceScanStats,
  };
}

/**
 * Get a single device by ID globally (no tenant filter)
 * Used by internal services that need to resolve device → organization
 * SECURITY: Only use this in authenticated internal endpoints
 */
export async function getDeviceByIdGlobal(deviceId: string) {
  const db = getDb();

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, deviceId))
    .limit(1);

  if (!device) return null;

  // Get primary IP
  const [primaryIp] = await db
    .select()
    .from(deviceIps)
    .where(and(
      eq(deviceIps.deviceId, deviceId),
      eq(deviceIps.primary, sql`1`)
    ))
    .limit(1);

  // Get tags
  const deviceTagsData = await db
    .select({ tag: tags })
    .from(deviceTags)
    .innerJoin(tags, eq(deviceTags.tagId, tags.id))
    .where(eq(deviceTags.deviceId, deviceId));

  return {
    ...device,
    ip: primaryIp?.ip || null,
    tags: deviceTagsData.map(({ tag }: any) => tag.name),
  };
}

/**
 * Delete a device
 */
export async function deleteDevice(deviceId: string, organizationId: string) {
  const db = getDb();

  const result = await db
    .delete(devices)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.organizationId, organizationId)
    ))
    .returning();

  return result.length > 0;
}

/**
 * Create multiple devices from discovery
 * Uses DNS resolution to normalize targets before persisting
 */
export async function createMultipleDevicesFromDiscovery(
  targets: Array<{ host: string; ip?: string }>,
  organizationId: string,
  options?: {
    projectId?: string | null;
    source?: string;
    scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';
    verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
  }
) {
  const db = getDb();

  // Default values for options
  const {
    projectId = null,
    source = 'DISCOVERY',
    scope = 'EXTERNAL',
    verificationStatus = 'CANDIDATE'
  } = options || {};

  // Validate project access if provided
  if (projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId)
      ))
      .limit(1);

    if (!project) {
      throw new Error('Project not found or access denied');
    }
  }

  // Use DNS resolution system to normalize and persist targets
  // Pass full target objects with fallback IPs for private zones
  const newDeviceIds = await resolveAndUpsertTargets(
    targets, // Now passes { host, ip? } directly
    organizationId,
    {
      projectId,
      source,
      scope,
      dnsTimeout: 5000,
      throwOnDnsError: false, // Graceful degradation
    }
  );

  // Early return if no new devices were created
  if (newDeviceIds.length === 0) {
    return [];
  }

  // Update verification status if specified (DNS resolver creates as CANDIDATE)
  if (verificationStatus !== 'CANDIDATE') {
    await db
      .update(devices)
      .set({ verificationStatus })
      .where(inArray(devices.id, newDeviceIds));
  }

  // Fetch newly created devices with IPs for backward compatibility
  const createdDevices = await db.query.devices.findMany({
    where: and(
      eq(devices.organizationId, organizationId),
      inArray(devices.id, newDeviceIds)
    ),
    with: {
      deviceIps: {
        where: eq(deviceIps.primary, sql`1`),
        limit: 1,
      },
    },
  });

  // Transform to match legacy return format
  type DeviceWithIps = typeof createdDevices[number];
  return createdDevices.map((device: DeviceWithIps) => ({
    ...device,
    ip: device.deviceIps?.[0]?.ip ?? null,
    tags: [],
  }));
}

/**
 * Update a device
 */
export async function updateDevice(
  deviceId: string,
  updates: DeviceUpdateData,
  organizationId: string
) {
  const db = getDb();

  // Fetch current device state BEFORE update (for promotion detection)
  const [previousDevice] = await db
    .select()
    .from(devices)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.organizationId, organizationId)
    ))
    .limit(1);

  if (!previousDevice) {
    throw new Error('Device not found');
  }

  // Extract non-device fields
  const { ip, tags: newTags, ...deviceUpdates } = updates;

  // Update device record
  const [updatedDevice] = await db
    .update(devices)
    .set(deviceUpdates)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.organizationId, organizationId)
    ))
    .returning();

  if (!updatedDevice) {
    throw new Error('Device not found after update');
  }

  // Update IP if provided
  if (ip !== undefined) {
    // Delete existing IPs
    await db
      .delete(deviceIps)
      .where(eq(deviceIps.deviceId, deviceId));

    // Create new IP if not empty
    if (ip) {
      await db.insert(deviceIps).values({
        organizationId,
        deviceId,
        ip,
        primary: sql`1`,
      });
    }
  }

  // Update tags if provided
  if (newTags !== undefined) {
    // Delete existing tags
    await db
      .delete(deviceTags)
      .where(eq(deviceTags.deviceId, deviceId));

    // Create new tags
    if (newTags.length > 0) {
      for (const tagName of newTags) {
        // Get or create tag
        const [tag] = await db
          .select()
          .from(tags)
          .where(and(
            eq(tags.organizationId, organizationId),
            eq(tags.name, tagName)
          ))
          .limit(1);

        let tagId: string;
        if (tag) {
          tagId = tag.id;
        } else {
          const [newTag] = await db
            .insert(tags)
            .values({
              organizationId,
              name: tagName,
            })
            .returning();
          tagId = newTag.id;
        }

        // Create device-tag association
        await db.insert(deviceTags).values({
          organizationId,
          deviceId,
          tagId,
        });
      }
    }
  }

  // Return updated device with IP and tags
  // Note: Server promotion notification is handled by caller (has access to env binding for queue)
  return getDeviceById(deviceId, organizationId);
}

/**
 * Detect if device was just promoted to VERIFIED status
 *
 * Call this helper after updateDevice() to check if promotion notification should be sent.
 * Returns device info if promoted, null otherwise.
 */
export async function detectDevicePromotion(params: {
  deviceId: string;
  organizationId: string;
  previousStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | null;
  newStatus: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED';
}): Promise<{ deviceId: string; deviceName: string; organizationId: string } | null> {
  const { deviceId, organizationId, previousStatus, newStatus } = params;

  // Check if promoted from non-VERIFIED to VERIFIED
  const wasPromoted = previousStatus !== 'VERIFIED' && newStatus === 'VERIFIED';

  if (!wasPromoted) {
    return null;
  }

  // Fetch device name
  const device = await getDeviceById(deviceId, organizationId);
  const deviceName = device?.name || device?.ip || deviceId;

  return { deviceId, deviceName, organizationId };
}

/**
 * Get tag suggestions for a tenant
 */
export async function getDeviceTagSuggestions(organizationId: string) {
  const db = getDb();

  const tagList = await db
    .select({ name: tags.name })
    .from(tags)
    .where(eq(tags.organizationId, organizationId))
    .orderBy(asc(tags.name));

  return tagList.map((t: any) => t.name);
}

/**
 * Get scan history for a device
 */
export async function getDeviceScanHistory(
  organizationId: string,
  deviceId: string,
  limit: number = 10
) {
  const db = getDb();

  return await db
    .select({
      id: scanRuns.id,
      requestedAt: scanRuns.requestedAt,
      resultSummary: scanRuns.resultSummary,
    })
    .from(scanRuns)
    .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
    .where(and(
      eq(scanRuns.organizationId, organizationId),
      eq(scanRunDevices.deviceId, deviceId),
      eq(scanRuns.status, 'SUCCEEDED')
    ))
    .orderBy(desc(scanRuns.requestedAt))
    .limit(limit);
}

/**
 * Verify a device
 */
export async function verifyDevice(
  deviceId: string,
  organizationId: string,
  userId: string,
  note?: string
) {
  return updateDevice(
    deviceId,
    {
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: userId,
      verificationNote: note || null,
    },
    organizationId
  );
}

/**
 * Unverify a device
 */
export async function unverifyDevice(deviceId: string, organizationId: string) {
  const db = getDb();

  // Delete scan schedule if exists
  await db
    .delete(scanSchedules)
    .where(and(
      eq(scanSchedules.deviceId, deviceId),
      eq(scanSchedules.organizationId, organizationId)
    ));

  // Update device status
  return updateDevice(
    deviceId,
    {
      verificationStatus: 'CANDIDATE',
      verifiedAt: undefined,
      verifiedBy: undefined,
      verificationNote: null,
    },
    organizationId
  );
}

// Scan schedule functions moved to queries/scan-schedules.ts
