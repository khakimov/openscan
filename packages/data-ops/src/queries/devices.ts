import { eq, desc, asc, and, or, inArray, sql, SQL } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { devices, deviceIps, deviceTags, tags, scanRuns, scanRunDevices, scanSchedules } from '../schema';

// Types
export type DeviceQueryParams = {
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  verificationStatus?: 'CANDIDATE' | 'VERIFIED' | 'EXCLUDED' | Array<'CANDIDATE' | 'VERIFIED' | 'EXCLUDED'>;
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

    // Get latest scan result summary for each device
    const latestScansSubquery = db
      .select({
        deviceId: scanRunDevices.deviceId,
        resultSummary: scanRuns.resultSummary,
        completedAt: scanRuns.completedAt,
        rowNum: sql<number>`row_number() OVER (PARTITION BY ${scanRunDevices.deviceId} ORDER BY ${scanRuns.completedAt} DESC)`.as('row_num'),
      })
      .from(scanRuns)
      .innerJoin(scanRunDevices, eq(scanRuns.id, scanRunDevices.runId))
      .where(and(
        inArray(scanRunDevices.deviceId, deviceIds),
        eq(scanRuns.organizationId, organizationId),
        eq(scanRuns.status, 'SUCCEEDED')
      ))
      .as('latest_scans');

    const latestScans: any[] = await db
      .select()
      .from(latestScansSubquery)
      .where(eq(latestScansSubquery.rowNum, 1));

    // Build maps
    const latestScanMap = new Map(latestScans.map((s: any) => [s.deviceId, s]));

    // Build scan stats map
    for (const stat of scanStats) {
      const latestScan = latestScanMap.get(stat.deviceId);
      const resultSummary = latestScan?.resultSummary as any;
      const ports = resultSummary?.ports || [];
      const openPortCount = resultSummary?.openPortCount || ports.length || 0;

      scanStatsMap.set(stat.deviceId, {
        scanCount: Number(stat.scanCount),
        totalScans: Number(stat.scanCount),
        lastScanAt: stat.lastScanAt,
        openPortCount,
        totalPortCount: openPortCount,
        ports,
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
    const ports = resultSummary?.ports || [];
    const openPortCount = resultSummary?.openPortCount || ports.length || 0;

    deviceScanStats = {
      scanCount: Number(stat.scanCount),
      totalScans: Number(stat.scanCount),
      lastScanAt: stat.lastScanAt,
      openPortCount,
      totalPortCount: openPortCount,
      ports,
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
 * Skips devices that already exist (based on name + organizationId)
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
  const createdDevices = [];

  // Default values for options
  const {
    projectId = null,
    source = 'DISCOVERY',
    scope = 'EXTERNAL',
    verificationStatus = 'CANDIDATE'
  } = options || {};

  for (const target of targets) {
    // Check if device already exists for this organization (by name + IP combination)
    // First get devices with matching name
    const devicesWithSameName = await db
      .select()
      .from(devices)
      .where(and(
        eq(devices.organizationId, organizationId),
        eq(devices.name, target.host)
      ));

    // If IP is provided, check if the name+IP combination exists
    if (target.ip && devicesWithSameName.length > 0) {
      // Get IPs for devices with same name
      const deviceIds = devicesWithSameName.map((d: any) => d.id);
      const existingIps = await db
        .select()
        .from(deviceIps)
        .where(and(
          inArray(deviceIps.deviceId, deviceIds),
          eq(deviceIps.ip, target.ip)
        ));

      if (existingIps.length > 0) {
        // Device with same name AND IP exists, skip
        console.log(`Device ${target.host} with IP ${target.ip} already exists, skipping`);
        continue;
      }
    } else if (!target.ip && devicesWithSameName.length > 0) {
      // No IP provided, but device with same name exists - skip to avoid name-only duplicates
      console.log(`Device ${target.host} already exists (no IP check), skipping`);
      continue;
    }

    const [device] = await db
      .insert(devices)
      .values({
        organizationId,
        projectId,
        name: target.host,
        source,
        scope,
        state: 'AVAILABLE',
        verificationStatus,
      })
      .returning();

    // Create IP if provided
    if (target.ip && device) {
      await db.insert(deviceIps).values({
        organizationId,
        deviceId: device.id,
        ip: target.ip,
        primary: sql`1`,
      });

      createdDevices.push({
        ...device,
        ip: target.ip,
        tags: [],
      });
    } else {
      createdDevices.push({
        ...device,
        ip: null,
        tags: [],
      });
    }
  }

  return createdDevices;
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
    throw new Error('Device not found');
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
  return getDeviceById(deviceId, organizationId);
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
  target: string,
  limit: number = 10
) {
  const db = getDb();

  const history = await db
    .select({
      id: scanRuns.id,
      status: scanRuns.status,
      scanType: scanRuns.scanType,
      target: scanRuns.target,
      requestedAt: scanRuns.requestedAt,
      startedAt: scanRuns.startedAt,
      completedAt: scanRuns.completedAt,
      resultSummary: scanRuns.resultSummary,
    })
    .from(scanRuns)
    .where(and(
      eq(scanRuns.organizationId, organizationId),
      eq(scanRuns.target, target)
    ))
    .orderBy(desc(scanRuns.requestedAt))
    .limit(limit);

  return history;
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

/**
 * Create scan schedule
 */
export async function createScanSchedule(data: {
  scheduleId: string;
  deviceId: string;
  organizationId: string;
  interval: string;
}) {
  const db = getDb();

  const [schedule] = await db
    .insert(scanSchedules)
    .values({
      scheduleId: data.scheduleId,
      deviceId: data.deviceId,
      organizationId: data.organizationId,
      interval: data.interval,
      isActive: new Date(),
    })
    .returning();

  return schedule;
}

/**
 * Get scan schedule by device ID
 */
export async function getScanScheduleByDeviceId(
  deviceId: string,
  organizationId: string
) {
  const db = getDb();

  const [schedule] = await db
    .select()
    .from(scanSchedules)
    .where(and(
      eq(scanSchedules.deviceId, deviceId),
      eq(scanSchedules.organizationId, organizationId)
    ))
    .limit(1);

  return schedule || null;
}

/**
 * Delete scan schedule
 */
export async function deleteScanSchedule(scheduleId: string) {
  const db = getDb();

  const result = await db
    .delete(scanSchedules)
    .where(eq(scanSchedules.scheduleId, scheduleId))
    .returning();

  return result.length > 0;
}
