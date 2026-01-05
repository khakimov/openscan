/**
 * DNS-over-HTTPS (DoH) resolver for Cloudflare Workers
 *
 * Uses Cloudflare's public DoH endpoint to resolve DNS queries.
 * Works in both Workers and Node.js environments.
 */

import { ipToPtr } from './ip-utils';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

/**
 * DNS query response from Cloudflare DoH
 */
interface DohResponse {
  Status: number; // 0 = NOERROR, 2 = SERVFAIL, 3 = NXDOMAIN
  TC: boolean; // Truncated
  RD: boolean; // Recursion Desired
  RA: boolean; // Recursion Available
  AD: boolean; // Authentic Data
  CD: boolean; // Checking Disabled
  Question?: Array<{
    name: string;
    type: number;
  }>;
  Answer?: Array<{
    name: string;
    type: number; // 1 = A, 28 = AAAA, 5 = CNAME, 12 = PTR
    TTL: number;
    data: string;
  }>;
  Authority?: Array<{
    name: string;
    type: number;
    TTL: number;
    data: string;
  }>;
}

/**
 * DNS record types
 */
export const DNS_TYPES = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  PTR: 12,
  MX: 15,
  TXT: 16,
} as const;

/**
 * DNS resolution error
 */
export class DnsResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: 'NXDOMAIN' | 'SERVFAIL' | 'TIMEOUT' | 'NETWORK' | 'UNKNOWN',
    public readonly query: string
  ) {
    super(message);
    this.name = 'DnsResolutionError';
  }
}

/**
 * Query DNS over HTTPS
 */
async function queryDoh(
  name: string,
  type: keyof typeof DNS_TYPES,
  options?: {
    timeout?: number;
  }
): Promise<DohResponse> {
  const controller = new AbortController();
  const timeoutId = options?.timeout
    ? setTimeout(() => controller.abort(), options.timeout)
    : undefined;

  try {
    const url = new URL(DOH_ENDPOINT);
    url.searchParams.set('name', name);
    url.searchParams.set('type', String(DNS_TYPES[type]));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/dns-json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new DnsResolutionError(
        `DoH query failed: ${response.status} ${response.statusText}`,
        'NETWORK',
        name
      );
    }

    const data = (await response.json()) as DohResponse;

    // Check DNS response status
    if (data.Status === 3) {
      // NXDOMAIN - domain doesn't exist
      throw new DnsResolutionError(
        `Domain not found: ${name}`,
        'NXDOMAIN',
        name
      );
    }

    if (data.Status === 2) {
      // SERVFAIL - server failure
      throw new DnsResolutionError(
        `DNS server failure for: ${name}`,
        'SERVFAIL',
        name
      );
    }

    if (data.Status !== 0) {
      // Other error
      throw new DnsResolutionError(
        `DNS query failed with status ${data.Status} for: ${name}`,
        'UNKNOWN',
        name
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DnsResolutionError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new DnsResolutionError(
        `DNS query timeout for: ${name}`,
        'TIMEOUT',
        name
      );
    }

    throw new DnsResolutionError(
      `DNS query error for ${name}: ${error instanceof Error ? error.message : String(error)}`,
      'NETWORK',
      name
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Resolve A records (IPv4 addresses) for a hostname
 *
 * @param hostname - Domain name to resolve
 * @param options - Query options
 * @returns Array of IPv4 addresses (empty if no records found)
 *
 * @example
 * const ips = await resolveA('example.com');
 * // ['93.184.216.34']
 */
export async function resolveA(
  hostname: string,
  options?: {
    timeout?: number;
    includeCname?: boolean;
  }
): Promise<string[]> {
  try {
    const response = await queryDoh(hostname, 'A', { timeout: options?.timeout });

    if (!response.Answer || response.Answer.length === 0) {
      return [];
    }

    // Extract A records (type 1)
    const addresses = response.Answer
      .filter(record => record.type === DNS_TYPES.A)
      .map(record => record.data);

    // If requested, also follow CNAME chains
    if (options?.includeCname) {
      const cnames = response.Answer
        .filter(record => record.type === DNS_TYPES.CNAME)
        .map(record => record.data);

      for (const cname of cnames) {
        const cnameIps = await resolveA(cname, { timeout: options?.timeout });
        addresses.push(...cnameIps);
      }
    }

    return addresses;
  } catch (error) {
    // NXDOMAIN is expected for some queries, return empty array
    if (error instanceof DnsResolutionError && error.code === 'NXDOMAIN') {
      return [];
    }
    throw error;
  }
}

/**
 * Resolve AAAA records (IPv6 addresses) for a hostname
 *
 * @param hostname - Domain name to resolve
 * @param options - Query options
 * @returns Array of IPv6 addresses (empty if no records found)
 */
export async function resolveAAAA(
  hostname: string,
  options?: {
    timeout?: number;
  }
): Promise<string[]> {
  try {
    const response = await queryDoh(hostname, 'AAAA', { timeout: options?.timeout });

    if (!response.Answer || response.Answer.length === 0) {
      return [];
    }

    // Extract AAAA records (type 28)
    return response.Answer
      .filter(record => record.type === DNS_TYPES.AAAA)
      .map(record => record.data);
  } catch (error) {
    if (error instanceof DnsResolutionError && error.code === 'NXDOMAIN') {
      return [];
    }
    throw error;
  }
}

/**
 * Resolve PTR records (reverse DNS) for an IP address
 *
 * @param ip - IP address to reverse lookup
 * @param options - Query options
 * @returns Array of hostnames (empty if no PTR records found)
 *
 * @example
 * const hostnames = await resolvePtr('8.8.8.8');
 * // ['dns.google']
 */
export async function resolvePtr(
  ip: string,
  options?: {
    timeout?: number;
  }
): Promise<string[]> {
  try {
    // Convert IP to PTR format (e.g., 8.8.8.8 → 8.8.8.8.in-addr.arpa)
    const ptrName = ipToPtr(ip);

    const response = await queryDoh(ptrName, 'PTR', { timeout: options?.timeout });

    if (!response.Answer || response.Answer.length === 0) {
      return [];
    }

    // Extract PTR records (type 12) and remove trailing dots
    return response.Answer
      .filter(record => record.type === DNS_TYPES.PTR)
      .map(record => record.data.replace(/\.$/, ''));
  } catch (error) {
    if (error instanceof DnsResolutionError && error.code === 'NXDOMAIN') {
      return [];
    }
    throw error;
  }
}

/**
 * Resolve both A and AAAA records for a hostname
 *
 * @param hostname - Domain name to resolve
 * @param options - Query options
 * @returns Object with IPv4 and IPv6 addresses
 *
 * @example
 * const { ipv4, ipv6 } = await resolveAll('example.com');
 * // { ipv4: ['93.184.216.34'], ipv6: ['2606:2800:220:1:248:1893:25c8:1946'] }
 */
export async function resolveAll(
  hostname: string,
  options?: {
    timeout?: number;
  }
): Promise<{
  ipv4: string[];
  ipv6: string[];
}> {
  // Query both A and AAAA records in parallel
  const [ipv4, ipv6] = await Promise.all([
    resolveA(hostname, options),
    resolveAAAA(hostname, options),
  ]);

  return { ipv4, ipv6 };
}
