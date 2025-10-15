import { parseString } from 'xml2js';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import { type ServiceFingerprintMatch } from './utils';
import {
  parseTiming,
  parseRunStats,
  parseScanInfo,
} from './metadata-parser';
import {
  processHostOutput,
} from './host-parser';
import type {
  ParsedNmapData,
  ParsedHostData,
  ParsedHost,
  ParsedPort,
  ParsedOsMatch,
  ParsedServiceDetails,
} from './types';

const parseXml = promisify(parseString);
const logger = createLogger({ name: 'portscan-xml-parser' });

// Re-export types for backward compatibility
export type {
  ParsedNmapData,
  ParsedHostData,
  ParsedHost,
  ParsedPort,
  ParsedOsMatch,
  ParsedServiceDetails,
  ServiceFingerprintMatch,
};

/**
 * Parse nmap XML output into structured data
 * Enhanced with legacy insights for production compatibility
 */
export async function parseNmapXml(xmlString: string): Promise<ParsedNmapData> {
  try {
    const result = await parseXml(xmlString) as any;

    const nmaprun = result.nmaprun;
    if (!nmaprun) {
      throw new Error('Invalid nmap XML: missing nmaprun element');
    }

    // Handle both single and multiple hosts
    const hostData = nmaprun.host;
    const hosts: Record<string, ParsedHostData> = {};

    // If no host data but scan completed successfully, return empty result
    // This happens when target is up but has no open ports in scanned range
    if (!hostData) {
      // Check if we have runstats indicating successful scan
      const runStats = parseRunStats(nmaprun.runstats);
      if ((runStats?.hosts?.up ?? 0) > 0 || runStats?.finished?.exit === 'success') {
        // Valid scan with zero open ports - return empty hosts
        logger.warn('Nmap scan completed but found no open ports (host may be filtered or ports closed)');
      } else {
        // Truly invalid XML
        throw new Error('Invalid nmap XML: no host data found');
      }
    } else {
      const hostArray = Array.isArray(hostData) ? hostData : [hostData];

      // Process each host
      for (const host of hostArray) {
        try {
          const hostResult = processHostOutput(host);
          if (hostResult) {
            hosts[hostResult.host.address] = hostResult;
          }
        } catch (error) {
          // Log error but continue with other hosts
          logger.warn(`Failed to process host: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (Object.keys(hosts).length === 0) {
        throw new Error('No valid hosts found in nmap XML');
      }
    }

    // Parse timing info from nmaprun attributes
    const timing = parseTiming(nmaprun);

    // Parse runstats for enhanced timing and host statistics
    const runStats = parseRunStats(nmaprun.runstats);

    // Use runstats timing if available, fall back to nmaprun timing
    const finalTiming = {
      start: timing.start,
      end: runStats?.finished?.time || timing.end,
      elapsed: runStats?.finished?.elapsed || timing.elapsed,
    };

    // Parse scan info
    const scanInfo = parseScanInfo(nmaprun.scaninfo);

    return {
      scanner: nmaprun.$.scanner || 'nmap',
      version: nmaprun.$.version || 'unknown',
      args: nmaprun.$.args || '',
      start: parseInt(nmaprun.$.start || '0'),
      startStr: nmaprun.$.startstr || '',
      hosts,
      timing: finalTiming,
      scanInfo,
      runStats, // Add enhanced runstats data
    };
  } catch (error) {
    throw new Error(`Failed to parse nmap XML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse nmap XML from mock file (for development)
 */
export async function parseNmapMockXml(mockFilePath: string): Promise<ParsedNmapData> {
  const fs = await import('fs/promises');

  try {
    const xmlContent = await fs.readFile(mockFilePath, 'utf-8');
    return parseNmapXml(xmlContent);
  } catch (error) {
    throw new Error(`Failed to read mock nmap XML file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Legacy compatibility function for single-host results
 * Extracts the first host from multi-host results for backward compatibility
 */
export function extractSingleHostResult(data: ParsedNmapData): {
  host: ParsedHost;
  ports: ParsedPort[];
  osInfo?: ParsedHostData['osInfo'];
  timing: ParsedNmapData['timing'];
  scanInfo?: ParsedNmapData['scanInfo'];
} | null {
  const hostAddresses = Object.keys(data.hosts);
  if (hostAddresses.length === 0) {
    // Return null for zero-host scans (valid result when no open ports found)
    return null;
  }

  // Use the first host for legacy compatibility
  const firstHost = data.hosts[hostAddresses[0]];

  return {
    host: firstHost.host,
    ports: firstHost.ports,
    osInfo: firstHost.osInfo,
    timing: data.timing,
    scanInfo: data.scanInfo,
  };
}

/**
 * Get filtered ports for retry logic (legacy requirement)
 */
export function getFilteredPorts(
  data: ParsedNmapData,
  hostAddress?: string
): { tcp: number[]; udp: number[] } {
  if (hostAddress && data.hosts[hostAddress]) {
    return data.hosts[hostAddress].filteredPorts;
  }

  // If no specific host, return filtered ports from first host
  const firstHost = Object.values(data.hosts)[0];
  return firstHost?.filteredPorts || { tcp: [], udp: [] };
}

/**
 * Check if scan needs retry (has filtered ports)
 */
export function needsRetry(data: ParsedNmapData, hostAddress?: string): boolean {
  const filteredPorts = getFilteredPorts(data, hostAddress);
  return filteredPorts.tcp.length > 0 || filteredPorts.udp.length > 0;
}
