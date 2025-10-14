/**
 * Port parsing functions for nmap XML
 * Handles port detection, service parsing, and filtered port tracking
 */

import { createLogger } from '@repo/logger';
import { normalizeServiceScheme, isGenericServiceName } from '../../../utilities/port-schemes';
import {
  extractCpeList,
  extractServiceFingerprintDetails,
  parsePortRange,
} from './utils';
import type { ParsedPort } from './types';

const logger = createLogger({ name: 'portscan-xml-parser' });

/**
 * Enhanced port parsing with legacy normalization and filtering
 */
export function parsePortsEnhanced(portsData: any): {
  ports: ParsedPort[];
  filteredPorts: { tcp: number[]; udp: number[] };
  portStatusMap?: Record<number, { status: string }>;
} {
  const ports: ParsedPort[] = [];
  const filteredPorts = { tcp: [] as number[], udp: [] as number[] };
  const portStatusMap: Record<number, { status: string }> = {};

  if (!portsData) {
    return { ports, filteredPorts };
  }

  // xml2js wraps elements in arrays - handle both wrapped and unwrapped
  const portsObj = Array.isArray(portsData) ? portsData[0] : portsData;

  // Parse extraports for filtered/closed ports tracking
  if (portsObj.extraports) {
    const extraportsArray = Array.isArray(portsObj.extraports)
      ? portsObj.extraports
      : [portsObj.extraports];

    for (const extraport of extraportsArray) {
      const state = extraport.$.state;

      if (state === 'filtered' && extraport.extrareasons) {
        const reasonsArray = Array.isArray(extraport.extrareasons)
          ? extraport.extrareasons
          : [extraport.extrareasons];

        for (const reason of reasonsArray) {
          const proto = (reason.$.proto || 'tcp') as 'tcp' | 'udp';
          const portsString = reason.$.ports;

          if (portsString) {
            const portNumbers = parsePortRange(portsString);
            if (proto === 'tcp') {
              filteredPorts.tcp.push(...portNumbers);
            } else if (proto === 'udp') {
              filteredPorts.udp.push(...portNumbers);
            }
          }
        }
      }
    }
  }

  // Use portsObj for the rest of the function
  const effectivePortsData = portsObj;

  // Handle different XML parsing structures
  let portArray = [];
  if (effectivePortsData.port) {
    // Standard structure: effectivePortsData.port
    portArray = Array.isArray(effectivePortsData.port) ? effectivePortsData.port : [effectivePortsData.port];
  }

  if (portArray.length === 0) {
    return { ports, filteredPorts };
  }

  for (const port of portArray) {
    try {
      const portNum = parseInt(port?.$?.portid || port?.portid || '0');
      const transportProtocol = (port?.$?.protocol || port?.protocol || 'tcp') as 'tcp' | 'udp';
      // XML structure: <state state="open" .../>
      // xml2js with explicitArray creates: port.state[0].$.state
      const state = (
        port?.state?.[0]?.$?.state ||
        port?.state?.$?.state ||
        port?.state?.state ||
        'unknown'
      ) as 'open' | 'closed' | 'filtered';

      // Track filtered ports for retry logic (legacy requirement)
      if (state === 'filtered') {
        if (transportProtocol === 'tcp') {
          filteredPorts.tcp.push(portNum);
        } else if (transportProtocol === 'udp') {
          filteredPorts.udp.push(portNum);
        }
      }

      // Create port status map for uptime scans
      portStatusMap[portNum] = { status: state };

      // Parse service information
      let service: ParsedPort['service'];
      if (port.service) {
        const serviceEntry = Array.isArray(port.service)
          ? port.service[0]
          : port.service;

        const serviceData = serviceEntry && typeof serviceEntry === 'object'
          ? serviceEntry
          : undefined;

        const serviceName = serviceData?.$?.name || serviceData?.name || (typeof serviceEntry === 'string' ? serviceEntry : undefined);
        const cpes = extractCpeList(serviceData);
        const fingerprintDetails = extractServiceFingerprintDetails(serviceData);

        service = {
          name: serviceName,
          product: serviceData?.$?.product || serviceData?.product || null,
          version: serviceData?.$?.version || serviceData?.version || null,
          extraInfo: serviceData?.$?.extrainfo || serviceData?.extrainfo || null,
          method: serviceData?.$?.method || serviceData?.method,
          conf: serviceData?.$?.conf ? parseInt(serviceData.$.conf) : serviceData?.conf ? parseInt(serviceData.conf) : undefined,
          tunnel: serviceData?.$?.tunnel || serviceData?.tunnel,
          cpe: cpes.length > 0 ? cpes : undefined,
          fingerprint: fingerprintDetails?.fingerprint,
          fingerprintMatches: fingerprintDetails?.matches,
        };
      }

      // Apply protocol normalization using shared port schemes
      // Store in service.name to preserve transport protocol for downstream processing
      const normalizedScheme = normalizeServiceScheme(
        portNum,
        transportProtocol,
        service?.name
      );

      // Only update/create service object if normalized scheme provides actual signal
      const providesNewSignal = normalizedScheme !== transportProtocol && !isGenericServiceName(normalizedScheme);

      if (service) {
        // NEVER override tcpwrapped - it's security-relevant information from nmap
        // tcpwrapped indicates the service is protected by TCP wrappers
        const isTcpwrapped = service.name === 'tcpwrapped';

        // Update existing service name if normalization corrected it or provides new info
        // BUT preserve tcpwrapped detection
        if (!isTcpwrapped && providesNewSignal && (!service.name || service.name !== normalizedScheme)) {
          service.name = normalizedScheme;
        }
      }
      // Don't create service object if nmap didn't provide one
      // Port-based guessing shouldn't create phantom service detections

      const parsedPort: ParsedPort = {
        port: portNum,
        protocol: transportProtocol, // Keep as transport protocol (tcp/udp)
        state,
        transportProtocol,
        service,
      };

      ports.push(parsedPort);
    } catch (error) {
      logger.warn(`Failed to parse port: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with other ports
    }
  }

  return { ports, filteredPorts, portStatusMap };
}

/**
 * Legacy port parsing for backward compatibility
 */
export function parsePorts(portsData: any): ParsedPort[] {
  if (!portsData || !portsData.port) {
    return [];
  }

  const ports = Array.isArray(portsData.port) ? portsData.port : [portsData.port];

  return ports.map((port: any) => {
    const parsedPort: ParsedPort = {
      port: parseInt(port.portid || '0'),
      protocol: port.protocol as 'tcp' | 'udp' || 'tcp',
      state: (
        port.state?.[0]?.$?.state ||
        port.state?.$?.state ||
        port.state?.state ||
        'unknown'
      ) as 'open' | 'closed' | 'filtered',
      transportProtocol: port.protocol as 'tcp' | 'udp' || 'tcp',
    };

    // Parse service information if available
    if (port.service) {
      const service = port.service;
      parsedPort.service = {
        name: service.name,
        product: service.product,
        version: service.version,
        extraInfo: service.extrainfo,
        method: service.method,
        conf: service.conf ? parseInt(service.conf) : undefined,
      };
    }

    return parsedPort;
  });
}
