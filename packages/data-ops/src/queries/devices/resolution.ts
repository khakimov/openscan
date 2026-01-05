/**
 * DNS Resolution and Asset Normalization
 *
 * Single entry point for resolving targets (hostnames or IPs) and
 * persisting them canonically in the database.
 *
 * Architecture:
 * 1. Normalize on ingestion - resolve DNS before any DB writes
 * 2. Persist canonically - upsert devices and IPs atomically
 * 3. Handle failures gracefully - retry instead of aborting
 * 4. Refresh separately - background jobs can update stale data
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../../database/setup';
import { devices, deviceIps, deviceHostnames } from '../../schema/inventory';
import { isIP, isIPv4, isIPv6 } from '@repo/contracts/network/ip-utils';
import {
  resolveA,
  resolveAAAA,
  resolvePtr,
  DnsResolutionError,
} from '@repo/contracts/network/dns-resolver';
import { createLogger } from '@repo/logger';
import { createId } from '@paralleldrive/cuid2';

const logger = createLogger({ name: 'device-resolution' });

/**
 * Resolution result for a single target
 */
export interface ResolutionResult {
  kind: 'hostname' | 'address';
  originalInput: string;
  primaryName: string; // Best name for the device (IP or hostname)
  ips: Array<{
    ip: string;
    version: 4 | 6;
    reverseDns?: string;
  }>;
  hostnames: Array<{
    hostname: string;
    type: 'A' | 'PTR' | 'INPUT';
  }>;
}

/**
 * Options for resolution and upsert
 */
export interface ResolveOptions {
  /**
   * Project ID to assign devices to (optional)
   */
  projectId?: string | null;

  /**
   * Source of the device (defaults to 'USER_INPUT')
   */
  source?: string;

  /**
   * Scope of the device (defaults to 'EXTERNAL')
   */
  scope?: 'INTERNAL' | 'EXTERNAL' | 'HYBRID';

  /**
   * DNS query timeout in milliseconds (defaults to 5000)
   */
  dnsTimeout?: number;

  /**
   * Whether to throw on DNS resolution errors (defaults to false)
   * If false, creates device anyway with whatever we have
   */
  throwOnDnsError?: boolean;
}

/**
 * Resolve a single target (hostname or IP) using DNS
 *
 * This is the core normalization function that handles:
 * - Forward DNS (hostname → IPs)
 * - Reverse DNS (IP → hostnames)
 * - Enrichment (IP gets PTR, hostname gets both A and PTR)
 *
 * @param target - Hostname or IP address
 * @param options - Resolution options (includes optional fallback IP)
 * @returns Normalized resolution result
 */
export async function resolveTarget(
  target: string,
  options?: Pick<ResolveOptions, 'dnsTimeout' | 'throwOnDnsError'> & {
    fallbackIp?: string;
  }
): Promise<ResolutionResult> {
  const timeout = options?.dnsTimeout ?? 5000;
  const trimmed = target.trim();
  const fallbackIp = options?.fallbackIp?.trim();

  logger.info('Resolving target', { target: trimmed, fallbackIp });

  // Case 1: Target is an IP address
  if (isIP(trimmed)) {
    const version = isIPv4(trimmed) ? 4 : 6;

    logger.info('Target is IP address', { ip: trimmed, version });

    try {
      // Attempt PTR lookup
      const ptrRecords = await resolvePtr(trimmed, { timeout });

      if (ptrRecords.length === 0) {
        logger.info('No PTR records found', { ip: trimmed });

        return {
          kind: 'address',
          originalInput: trimmed,
          primaryName: trimmed,
          ips: [{ ip: trimmed, version }],
          hostnames: [],
        };
      }

      // Use first PTR as primary name
      const primaryHostname = ptrRecords[0];

      logger.info('PTR records found', {
        ip: trimmed,
        ptr: ptrRecords,
        primaryHostname,
      });

      // Verify PTR with forward lookup (sanity check)
      const forwardIps: string[] = await resolveA(primaryHostname, { timeout }).catch(() => []);

      // Log cross-check result for ops visibility
      if (forwardIps.length > 0) {
        const matches = forwardIps.includes(trimmed);
        logger.info('PTR forward-lookup cross-check', {
          ip: trimmed,
          hostname: primaryHostname,
          forwardIps,
          matches,
        });

        if (!matches) {
          logger.warn('PTR mismatch: forward lookup does not resolve back to original IP', {
            ip: trimmed,
            hostname: primaryHostname,
            forwardIps,
          });
        }
      } else {
        logger.warn('PTR forward-lookup failed', {
          ip: trimmed,
          hostname: primaryHostname,
        });
      }

      return {
        kind: 'address',
        originalInput: trimmed,
        primaryName: trimmed, // Still use IP as primary (it's the source of truth)
        ips: [
          { ip: trimmed, version, reverseDns: primaryHostname },
        ],
        hostnames: ptrRecords.map(hostname => ({
          hostname,
          type: 'PTR' as const,
        })),
      };
    } catch (error) {
      if (error instanceof DnsResolutionError) {
        logger.warn('PTR lookup failed', {
          ip: trimmed,
          error: error.message,
          code: error.code,
        });

        if (options?.throwOnDnsError) {
          throw error;
        }

        // Return IP without PTR
        return {
          kind: 'address',
          originalInput: trimmed,
          primaryName: trimmed,
          ips: [{ ip: trimmed, version }],
          hostnames: [],
        };
      }

      throw error;
    }
  }

  // Case 2: Target is a hostname
  logger.info('Target is hostname', { hostname: trimmed });

  try {
    // Query both A and AAAA records in parallel
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      resolveA(trimmed, { timeout }),
      resolveAAAA(trimmed, { timeout }),
    ]);

    const allIps: Array<{
      ip: string;
      version: 4 | 6;
      reverseDns?: string;
    }> = [
      ...ipv4Addresses.map(ip => ({ ip, version: 4 as const })),
      ...ipv6Addresses.map(ip => ({ ip, version: 6 as const })),
    ];

    if (allIps.length === 0) {
      logger.warn('No A/AAAA records found for hostname', { hostname: trimmed, fallbackIp });

      if (options?.throwOnDnsError) {
        throw new DnsResolutionError(
          `No A/AAAA records found for hostname: ${trimmed}`,
          'NXDOMAIN',
          trimmed
        );
      }

      // Use fallback IP if provided (for private zones or transient DNS failures)
      if (fallbackIp && isIP(fallbackIp)) {
        const version = isIPv4(fallbackIp) ? 4 : 6;
        logger.info('Using fallback IP for hostname', { hostname: trimmed, ip: fallbackIp });

        return {
          kind: 'hostname',
          originalInput: trimmed,
          primaryName: trimmed,
          ips: [{ ip: fallbackIp, version }],
          hostnames: [{ hostname: trimmed, type: 'INPUT' as const }],
        };
      }

      // Both DNS resolution and fallback failed
      logger.warn('DNS resolution failed with no fallback IP - device will have no address', {
        hostname: trimmed,
        fallbackProvided: !!options?.fallbackIp,
        fallbackValid: fallbackIp ? isIP(fallbackIp) : false,
      });

      // Return hostname without IPs (will be flagged for retry)
      return {
        kind: 'hostname',
        originalInput: trimmed,
        primaryName: trimmed,
        ips: [],
        hostnames: [{ hostname: trimmed, type: 'INPUT' as const }],
      };
    }

    logger.info('Forward lookup successful', {
      hostname: trimmed,
      ipCount: allIps.length,
    });

    // Attempt reverse lookup on first IP (enrichment)
    const firstIp = allIps[0];
    const ptrRecords = await resolvePtr(firstIp.ip, { timeout }).catch(() => []);

    // Attach reverse DNS to first IP if found
    if (ptrRecords.length > 0) {
      firstIp.reverseDns = ptrRecords[0];
    }

    return {
      kind: 'hostname',
      originalInput: trimmed,
      primaryName: trimmed,
      ips: allIps,
      hostnames: [
        { hostname: trimmed, type: 'INPUT' as const },
        ...ptrRecords.map(ptr => ({
          hostname: ptr,
          type: 'PTR' as const,
        })),
      ],
    };
  } catch (error) {
    if (error instanceof DnsResolutionError) {
      logger.warn('Hostname resolution failed', {
        hostname: trimmed,
        error: error.message,
        code: error.code,
      });

      if (options?.throwOnDnsError) {
        throw error;
      }

      // Return hostname without IPs
      return {
        kind: 'hostname',
        originalInput: trimmed,
        primaryName: trimmed,
        ips: [],
        hostnames: [{ hostname: trimmed, type: 'INPUT' as const }],
      };
    }

    throw error;
  }
}

/**
 * Upsert a device with its IPs and hostnames
 *
 * Ensures atomic creation/update of:
 * - Device record
 * - Device IPs (with primary flag)
 * - Device hostnames (A/PTR records)
 *
 * @param organizationId - Organization owning the device
 * @param resolved - Resolution result from resolveTarget
 * @param options - Upsert options
 * @returns Device ID and whether it was newly created
 */
export async function upsertResolvedDevice(
  organizationId: string,
  resolved: ResolutionResult,
  options?: ResolveOptions
): Promise<{ deviceId: string; isNew: boolean }> {
  const db = getDb();

  logger.info('Upserting resolved device', {
    organizationId,
    primaryName: resolved.primaryName,
    ipCount: resolved.ips.length,
    hostnameCount: resolved.hostnames.length,
  });

  // Step 1: Ensure device exists
  const { deviceId, isNew } = await ensureDevice(
    organizationId,
    resolved.primaryName,
    options
  );

  // Step 1.5: Fetch current primary IP (before upsert) for drift detection
  let oldPrimaryIp: string | null = null;
  if (!isNew) {
    const currentPrimaryIp = await db.query.deviceIps.findFirst({
      where: and(
        eq(deviceIps.organizationId, organizationId),
        eq(deviceIps.deviceId, deviceId),
        eq(deviceIps.primary, true)
      ),
      columns: { ip: true },
    });
    oldPrimaryIp = currentPrimaryIp?.ip ?? null;
  }

  // Step 2: Upsert IPs
  await upsertIps(
    organizationId,
    deviceId,
    resolved.ips
  );

  // Step 2.5: Detect IP change and log configuration drift
  if (!isNew && oldPrimaryIp && resolved.ips.length > 0) {
    const newPrimaryIp = resolved.ips[0].ip; // First IP is primary

    if (oldPrimaryIp !== newPrimaryIp) {
      logger.info('Primary IP changed, logging configuration drift', {
        deviceId,
        deviceName: resolved.primaryName,
        oldIp: oldPrimaryIp,
        newIp: newPrimaryIp,
      });

      // Import and call logServerIPChanged
      // Note: Import at top of file to avoid circular dependencies
      try {
        const { logServerIPChanged } = await import('../notifications/configuration');
        await logServerIPChanged({
          organizationId,
          deviceId,
          deviceName: resolved.primaryName,
          oldIp: oldPrimaryIp,
          newIp: newPrimaryIp,
        });
      } catch (error) {
        logger.error('Failed to log IP change notification', {
          deviceId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - configuration drift logging is non-critical
      }
    }
  }

  // Step 3: Upsert hostnames
  await upsertHostnames(
    organizationId,
    deviceId,
    resolved.hostnames
  );

  logger.info('Device upserted successfully', {
    deviceId,
    organizationId,
    primaryName: resolved.primaryName,
    isNew,
  });

  return { deviceId, isNew };
}

/**
 * Ensure device exists, create if not
 * @returns Device ID and whether it was newly created
 */
async function ensureDevice(
  organizationId: string,
  name: string,
  options?: ResolveOptions
): Promise<{ deviceId: string; isNew: boolean }> {
  const db = getDb();

  // Check if device exists by name within organization
  const existing = await db.query.devices.findFirst({
    where: and(
      eq(devices.organizationId, organizationId),
      eq(devices.name, name)
    ),
    columns: { id: true },
  });

  if (existing) {
    // Update lastSeenAt
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(devices.id, existing.id));

    return { deviceId: existing.id, isNew: false };
  }

  // Create new device
  const deviceId = createId();

  await db.insert(devices).values({
    id: deviceId,
    organizationId,
    projectId: options?.projectId ?? null,
    name,
    source: options?.source ?? 'USER_INPUT',
    scope: options?.scope ?? 'EXTERNAL',
    lastSeenAt: new Date(),
  });

  logger.info('Device created', { deviceId, name, organizationId });

  return { deviceId, isNew: true };
}

/**
 * Upsert device IPs
 */
async function upsertIps(
  organizationId: string,
  deviceId: string,
  ips: Array<{ ip: string; version: 4 | 6; reverseDns?: string }>
): Promise<void> {
  const db = getDb();

  for (let i = 0; i < ips.length; i++) {
    const { ip, reverseDns } = ips[i];
    const isPrimary = i === 0; // First IP is primary

    // Check if IP already exists for this device
    const existing = await db.query.deviceIps.findFirst({
      where: and(
        eq(deviceIps.organizationId, organizationId),
        eq(deviceIps.deviceId, deviceId),
        eq(deviceIps.ip, ip)
      ),
      columns: { id: true },
    });

    if (existing) {
      // Update existing IP
      await db
        .update(deviceIps)
        .set({
          primary: isPrimary,
          reverseDns: reverseDns ?? null,
        })
        .where(eq(deviceIps.id, existing.id));
    } else {
      // Insert new IP
      await db.insert(deviceIps).values({
        id: createId(),
        organizationId,
        deviceId,
        ip,
        primary: isPrimary,
        reverseDns: reverseDns ?? null,
      });
    }

    logger.info('Device IP upserted', {
      deviceId,
      ip,
      isPrimary,
      reverseDns,
    });
  }
}

/**
 * Upsert device hostnames
 */
async function upsertHostnames(
  organizationId: string,
  deviceId: string,
  hostnames: Array<{ hostname: string; type: 'A' | 'PTR' | 'INPUT' }>
): Promise<void> {
  const db = getDb();

  for (const { hostname, type } of hostnames) {
    // Check if hostname already exists for this device
    const existing = await db.query.deviceHostnames.findFirst({
      where: and(
        eq(deviceHostnames.organizationId, organizationId),
        eq(deviceHostnames.deviceId, deviceId),
        eq(deviceHostnames.hostname, hostname),
        eq(deviceHostnames.type, type)
      ),
      columns: { id: true },
    });

    if (existing) {
      // Update lastSeenAt
      await db
        .update(deviceHostnames)
        .set({ lastSeenAt: new Date() })
        .where(eq(deviceHostnames.id, existing.id));
    } else {
      // Insert new hostname
      await db.insert(deviceHostnames).values({
        id: createId(),
        organizationId,
        deviceId,
        hostname,
        type,
        source: 'DISCOVERY',
        lastSeenAt: new Date(),
      });
    }

    logger.info('Device hostname upserted', {
      deviceId,
      hostname,
      type,
    });
  }
}

/**
 * Resolve and upsert multiple targets atomically
 *
 * This is the main entry point for bulk device creation.
 * Each target is resolved and upserted independently.
 *
 * @param targets - Array of targets with host and optional IP fallback
 * @param organizationId - Organization owning the devices
 * @param options - Resolution and upsert options
 * @returns Array of newly created device IDs (excludes already-existing devices)
 */
export async function resolveAndUpsertTargets(
  targets: Array<{ host: string; ip?: string }>,
  organizationId: string,
  options?: ResolveOptions
): Promise<string[]> {
  const newDeviceIds: string[] = [];

  for (const target of targets) {
    try {
      // Resolve target with fallback IP for private zones
      const resolved = await resolveTarget(target.host, {
        dnsTimeout: options?.dnsTimeout,
        throwOnDnsError: options?.throwOnDnsError,
        fallbackIp: target.ip,
      });

      // Upsert device and track if it was newly created
      const { deviceId, isNew } = await upsertResolvedDevice(
        organizationId,
        resolved,
        options
      );

      // Only include newly created devices (legacy behavior)
      if (isNew) {
        newDeviceIds.push(deviceId);
      } else {
        logger.info('Device already exists, skipping', {
          deviceId,
          host: target.host,
        });
      }
    } catch (error) {
      logger.error('Failed to resolve and upsert target', {
        target: target.host,
        error: error instanceof Error ? error.message : String(error),
      });

      // Continue with other targets unless throwOnDnsError is true
      if (options?.throwOnDnsError) {
        throw error;
      }
    }
  }

  logger.info('Batch resolution complete', {
    total: targets.length,
    newDevices: newDeviceIds.length,
    skipped: targets.length - newDeviceIds.length,
  });

  return newDeviceIds;
}
