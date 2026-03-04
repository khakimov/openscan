/**
 * Hosting Provider Detection Service
 * 
 * Detects hosting providers (Cloudflare, AWS, GCP, etc.) from IP addresses
 * using ip-api.com (free tier: 45 req/min) with caching.
 */

import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { deviceIps, hostingProviders } from '../schema';

// ip-api.com response fields we request
interface IPApiResponse {
  status: 'success' | 'fail';
  message?: string;
  query: string;
  isp: string;
  org: string;
  as: string;
  asname: string;
  country?: string;
  regionName?: string;
  city?: string;
}

// Detection result
export interface HostingDetectionResult {
  provider: string;
  category: 'CDN' | 'CLOUD' | 'HOSTING' | 'DATACENTER' | 'UNKNOWN';
  asn: string;
  asOrganization: string;
  region?: string;
  raw: IPApiResponse;
}

// Provider normalization map
const PROVIDER_MAPPINGS: Array<{
  patterns: string[];
  name: string;
  category: 'CDN' | 'CLOUD' | 'HOSTING' | 'DATACENTER';
  iconKey: string;
}> = [
  {
    patterns: ['cloudflare', 'cloudflarenet'],
    name: 'Cloudflare',
    category: 'CDN',
    iconKey: 'cloudflare',
  },
  {
    patterns: ['amazon', 'aws', 'amazon.com', 'amazon technologies', 'amazon web services', 'amazonec2'],
    name: 'AWS',
    category: 'CLOUD',
    iconKey: 'aws',
  },
  {
    patterns: ['google cloud', 'google llc', 'google-c', 'google-p'],
    name: 'GCP',
    category: 'CLOUD',
    iconKey: 'gcp',
  },
  {
    patterns: ['microsoft', 'azure', 'microsoft corporation', 'msft'],
    name: 'Azure',
    category: 'CLOUD',
    iconKey: 'azure',
  },
  {
    patterns: ['digitalocean', 'digitalocean llc', 'digital ocean'],
    name: 'DigitalOcean',
    category: 'HOSTING',
    iconKey: 'digitalocean',
  },
  {
    patterns: ['linode', 'linode llc', 'akamai', 'akamai technologies'],
    name: 'Linode',
    category: 'HOSTING',
    iconKey: 'linode',
  },
  {
    patterns: ['vultr', 'vultr holdings'],
    name: 'Vultr',
    category: 'HOSTING',
    iconKey: 'vultr',
  },
  {
    patterns: ['hetzner', 'hetzner online'],
    name: 'Hetzner',
    category: 'HOSTING',
    iconKey: 'hetzner',
  },
  {
    patterns: ['ovh', 'ovhcloud', 'ovh sas'],
    name: 'OVH',
    category: 'HOSTING',
    iconKey: 'ovh',
  },
  {
    patterns: ['fastly'],
    name: 'Fastly',
    category: 'CDN',
    iconKey: 'fastly',
  },
  {
    patterns: ['incapsula', 'imperva'],
    name: 'Imperva',
    category: 'CDN',
    iconKey: 'imperva',
  },
  {
    patterns: ['alibaba', 'alibabacloud'],
    name: 'Alibaba Cloud',
    category: 'CLOUD',
    iconKey: 'alibaba',
  },
  {
    patterns: ['oracle', 'oracle cloud'],
    name: 'Oracle Cloud',
    category: 'CLOUD',
    iconKey: 'oracle',
  },
  {
    patterns: ['ibm', 'ibm cloud', 'softlayer'],
    name: 'IBM Cloud',
    category: 'CLOUD',
    iconKey: 'ibm',
  },
  {
    patterns: ['rackspace'],
    name: 'Rackspace',
    category: 'HOSTING',
    iconKey: 'rackspace',
  },
];

/**
 * Normalize provider name from ISP/Org/ASN strings
 */
function normalizeProvider(
  isp: string,
  org: string,
  asname: string
): { name: string; category: 'CDN' | 'CLOUD' | 'HOSTING' | 'DATACENTER' | 'UNKNOWN'; iconKey: string } {
  const searchStr = `${isp} ${org} ${asname}`.toLowerCase();

  for (const mapping of PROVIDER_MAPPINGS) {
    if (mapping.patterns.some((p) => searchStr.includes(p))) {
      return {
        name: mapping.name,
        category: mapping.category,
        iconKey: mapping.iconKey,
      };
    }
  }

  // Unknown - use ISP or Org as name
  return {
    name: isp || org || 'Unknown',
    category: 'UNKNOWN',
    iconKey: 'server',
  };
}

/**
 * Extract region from org string (e.g., "AWS EC2 (us-east-1)" → "us-east-1")
 */
function extractRegion(org: string): string | undefined {
  // Match patterns like "(us-east-1)", "(us-central1)", "(eu-west-1)"
  const match = org.match(/\(([a-z]+-[a-z]+-\d+)\)/);
  return match?.[1];
}

/**
 * Detect hosting provider for an IP address using ip-api.com
 * 
 * Rate limit: 45 requests per minute (free tier)
 */
export async function detectHostingProvider(
  ip: string
): Promise<HostingDetectionResult | null> {
  try {
    // Validate IP format
    if (!isValidIP(ip)) {
      console.warn(`[HostingDetection] Invalid IP: ${ip}`);
      return null;
    }

    // Call ip-api.com
    const fields = 'status,message,isp,org,as,asname,country,regionName,city';
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=${fields}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`[HostingDetection] API error: ${response.status} for IP ${ip}`);
      return null;
    }

    const data: IPApiResponse = await response.json();

    if (data.status !== 'success') {
      console.warn(`[HostingDetection] API failed: ${data.message} for IP ${ip}`);
      return null;
    }

    // Normalize provider
    const normalized = normalizeProvider(data.isp, data.org, data.asname);

    // Extract ASN number (e.g., "AS13335 Cloudflare, Inc." → "AS13335")
    const asn = data.as?.split(' ')[0] || '';

    return {
      provider: normalized.name,
      category: normalized.category,
      asn,
      asOrganization: data.isp,
      region: extractRegion(data.org),
      raw: data,
    };
  } catch (error) {
    console.error(`[HostingDetection] Error detecting hosting for ${ip}:`, error);
    return null;
  }
}

/**
 * Validate IP address format (IPv4 and IPv6)
 */
function isValidIP(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Get or create a hosting provider record
 */
export async function upsertHostingProvider(
  detection: HostingDetectionResult
): Promise<{ id: string; name: string; category: string; iconKey: string }> {
  const db = getDb();

  // Check if provider exists by ASN (most reliable) or name
  const existingByAsn = detection.asn
    ? await db
        .select()
        .from(hostingProviders)
        .where(eq(hostingProviders.asn, detection.asn))
        .limit(1)
    : [];

  if (existingByAsn.length > 0) {
    return existingByAsn[0];
  }

  // Check by name
  const existingByName = await db
    .select()
    .from(hostingProviders)
    .where(eq(hostingProviders.name, detection.provider))
    .limit(1);

  if (existingByName.length > 0) {
    return existingByName[0];
  }

  // Create new provider
  const [newProvider] = await db
    .insert(hostingProviders)
    .values({
      name: detection.provider,
      category: detection.category,
      asn: detection.asn || null,
      asOrganization: detection.asOrganization || null,
      iconKey: PROVIDER_MAPPINGS.find((p) => p.name === detection.provider)?.iconKey || 'server',
    })
    .returning();

  return newProvider;
}

/**
 * Update device IP with hosting provider information
 */
export async function updateDeviceIpHosting(
  deviceIpId: string,
  detection: HostingDetectionResult,
  providerId: string
): Promise<void> {
  const db = getDb();

  await db
    .update(deviceIps)
    .set({
      hostingProviderId: providerId,
      hostingDetectedAt: new Date(),
      hostingDetectionSource: 'IP_API',
      hostingRawData: JSON.stringify(detection.raw),
    })
    .where(eq(deviceIps.id, deviceIpId));
}

/**
 * Get IPs that need hosting detection
 */
export async function getIpsNeedingDetection(limit: number = 40): Promise<
  Array<{
    id: string;
    ip: string;
    deviceId: string;
    organizationId: string;
  }>
> {
  const db = getDb();

  return await db
    .select({
      id: deviceIps.id,
      ip: deviceIps.ip,
      deviceId: deviceIps.deviceId,
      organizationId: deviceIps.organizationId,
    })
    .from(deviceIps)
    .where(isNull(deviceIps.hostingDetectedAt))
    .limit(limit);
}

/**
 * Get hosting provider for a device by device ID
 */
export async function getHostingProviderForDevice(deviceId: string): Promise<
  | {
      id: string;
      name: string;
      category: string;
      asn: string | null;
      iconKey: string | null;
      detectedAt: Date | null;
    }
  | undefined
> {
  const db = getDb();

  const result = await db
    .select({
      id: hostingProviders.id,
      name: hostingProviders.name,
      category: hostingProviders.category,
      asn: hostingProviders.asn,
      iconKey: hostingProviders.iconKey,
      detectedAt: deviceIps.hostingDetectedAt,
    })
    .from(deviceIps)
    .leftJoin(hostingProviders, eq(deviceIps.hostingProviderId, hostingProviders.id))
    .where(and(eq(deviceIps.deviceId, deviceId), eq(deviceIps.primary, 1 as any)))
    .limit(1);

  return result[0];
}

/**
 * Batch detect hosting providers for multiple IPs
 * Respects rate limits (waits between requests)
 */
export async function batchDetectHosting(
  batchSize: number = 40,
  onProgress?: (processed: number, total: number) => void
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const ips = await getIpsNeedingDetection(batchSize);
  
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < ips.length; i++) {
    const { id, ip } = ips[i];

    try {
      const detection = await detectHostingProvider(ip);

      if (detection) {
        const provider = await upsertHostingProvider(detection);
        await updateDeviceIpHosting(id, detection, provider.id);
        succeeded++;
      } else {
        // Mark as attempted but unknown (set empty detection to avoid retry)
        const db = getDb();
        await db
          .update(deviceIps)
          .set({
            hostingDetectedAt: new Date(),
            hostingDetectionSource: 'IP_API',
            hostingRawData: JSON.stringify({ error: 'Detection failed' }),
          })
          .where(eq(deviceIps.id, id));
        failed++;
      }
    } catch (error) {
      console.error(`[HostingDetection] Failed for ${ip}:`, error);
      failed++;
    }

    // Rate limit: 45 req/min = 1.33s per request
    // We use 1.5s to be safe
    if (i < ips.length - 1) {
      await sleep(1500);
    }

    onProgress?.(i + 1, ips.length);
  }

  return { processed: ips.length, succeeded, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
