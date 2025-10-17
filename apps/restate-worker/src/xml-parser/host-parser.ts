/**
 * Host parsing functions for nmap XML
 * Handles host information, address, hostnames, and status
 */

import { createLogger } from '@repo/logger';
import { parsePortsEnhanced } from './port-parser';
import { parseOsInfoEnhanced, extractOsMatchesCpe } from './os-parser';
import type {
  ParsedHost,
  ParsedHostData,
  ParsedPort,
  ParsedServiceDetails,
  ParsedOsMatch,
  OsInfo,
  ServiceFingerprintMatch,
} from './types';

const logger = createLogger({ name: 'portscan-xml-parser' });

/**
 * Parse host information (address, hostnames, status)
 */
export function parseHost(host: any): ParsedHost {
  // Parse address (required)
  const address = Array.isArray(host.address) ? host.address[0] : host.address;

  // Parse hostnames (optional)
  let hostnames: string[] = [];
  if (host.hostnames) {
    // hostnames can be wrapped in array by xml2js
    const hostnamesObj = Array.isArray(host.hostnames) ? host.hostnames[0] : host.hostnames;

    if (hostnamesObj && hostnamesObj.hostname) {
      const hostnameData = Array.isArray(hostnamesObj.hostname)
        ? hostnamesObj.hostname
        : [hostnamesObj.hostname];

      hostnames = hostnameData
        .map((h: any) => h?.$?.name || h?.name || h?.text || '')
        .filter(Boolean);
    }
  }

  // Parse status (handle both array and object forms)
  const statusObj = Array.isArray(host.status) ? host.status[0] : host.status;

  return {
    address: address?.$?.addr || address?.addr || '',
    addressType: address?.$?.addrtype || address?.addrtype || 'ipv4',
    hostnames,
    status: statusObj?.$?.state || statusObj?.state || 'unknown',
    reason: statusObj?.$?.reason || statusObj?.reason,
  };
}

/**
 * Process single host output (enhanced with legacy logic)
 * Main orchestrator that combines all parsing functions
 */
export function processHostOutput(host: any): ParsedHostData | null {
  try {
    // Parse host information
    const parsedHost = parseHost(host);
    if (!parsedHost.address) {
      return null; // Skip invalid hosts
    }

    // Parse ports with enhanced logic
    const { ports, filteredPorts, portStatusMap } = parsePortsEnhanced(host.ports);

    // Parse OS information with CPE extraction
    const osInfo = parseOsInfoEnhanced(host.os);
    const osMatches = extractOsMatchesCpe(osInfo);

    return {
      host: parsedHost,
      scanData: ports,
      osMatches,
      osInfo,
      ports, // Legacy compatibility
      filteredPorts,
      portStatusMap,
    };
  } catch (error) {
    logger.warn(`Failed to process individual host: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Re-export types for convenience
export type { ParsedPort, ParsedServiceDetails, ParsedOsMatch, OsInfo, ServiceFingerprintMatch };
