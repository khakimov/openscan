import type { CVEEnrichment, PortSnapshot } from '@repo/data-ops';
import { buildPortEnrichmentMap } from '@repo/data-ops';
import {
  createNectoAPIClient,
  type NectoAPIClient,
} from '@/server/discovery/services/necto-api-client';
import { shouldDiscardServiceDetection, type ServiceDetection } from '@repo/contracts/device';
import { createLogger } from '@repo/logger';

const logger = createLogger({ name: 'port-scan-utils' });

/**
 * Singleton Necto client reused across postback executions.
 */
let nectoClientInstance: NectoAPIClient | null = null;

export function getNectoAPIClient(nectoApiUrl?: string, apiKey?: string): NectoAPIClient {
  if (!nectoClientInstance) {
    const baseUrl = nectoApiUrl || process.env.NECTO_API_URL || 'http://127.0.0.1:5020';

    nectoClientInstance = createNectoAPIClient({
      baseUrl,
      apiKey: apiKey || process.env.WORKER_API_KEY,
      timeout: 30000,
      retries: 2,
    });
  }

  return nectoClientInstance;
}

/**
 * Resets the cached Necto client instance (handy for tests).
 */
export function resetNectoClientForTesting(): void {
  nectoClientInstance = null;
}

/**
 * Filters service detections to remove low-confidence/noisy results.
 *
 * This acts as a gatekeeper in the postback handler, ensuring that even if
 * the worker bypasses filtering, we never persist junk data to the database.
 *
 * Filtering rules (from @repo/contracts/device):
 * - Remove non-open ports
 * - Remove low-confidence services (tcpwrapped, unknown, jetdirect) on non-standard ports
 * - Remove Incapsula CDN misdetections on non-HTTPS ports
 *
 * @param ports - Raw port data from postback
 * @returns Filtered port data ready for persistence
 */
export function normalizeServiceDetections(
  ports: Array<ServiceDetection>
): ServiceDetection[] {
  return ports.filter((det) => {
    const discard = shouldDiscardServiceDetection(det);
    if (discard) {
      logger.info('Postback gatekeeper: dropping low-confidence detection', {
        port: det.port,
        protocol: det.protocol,
        state: det.state,
        service: det.service?.name,
        product: det.service?.product,
      });
    }
    return !discard;
  });
}

/**
 * Known non-HTTP services that should never be probed by httpx.
 * These are well-known protocols that don't speak HTTP.
 */
const NON_HTTP_SERVICES = new Set([
  'ssh', 'ftp', 'smtp', 'pop3', 'imap', 'dns', 'mysql', 'postgresql',
  'redis', 'mongodb', 'memcached', 'ldap', 'smb', 'netbios-ssn',
  'microsoft-ds', 'ntp', 'snmp', 'telnet', 'vnc', 'rdp', 'ms-wbt-server',
  'xmpp-client', 'xmpp-server', 'rwhois', 'kerberos', 'sip',
  'rtsp', 'mqtt', 'amqp', 'bgp', 'dhcp', 'tftp',
]);

/**
 * Returns the list of ports that should be probed via httpx based on service detection.
 * Filters out known non-HTTP services (SSH, SMTP, XMPP, etc.) to avoid wasted probes.
 */
export function extractPortsForHttpx(
  ports: Array<{ port: number; state: string; service?: unknown }>
): number[] {
  return ports
    .filter((p) => p.state === 'open' && isHttpCandidate(p.service))
    .map((p) => p.port)
    .sort((a, b) => a - b);
}

function isHttpCandidate(service: unknown): boolean {
  if (!service || typeof service !== 'object') {
    // No service info — still worth probing (could be HTTP on a non-standard port)
    return true;
  }

  const candidate = service as { name?: string; product?: string };

  // No service name detected — probe it
  if (!candidate.name && !candidate.product) {
    return false;
  }

  // Skip known non-HTTP services
  if (candidate.name && NON_HTTP_SERVICES.has(candidate.name.toLowerCase())) {
    return false;
  }

  return true;
}

/**
 * Normalizes raw port scan results into the PortSnapshot shape we store.
 */
export function buildPortSnapshots(params: {
  ports: Array<{
    port: number;
    protocol: 'tcp' | 'udp';
    state: 'open' | 'closed' | 'filtered';
    service?: {
      name?: string | null;
      product?: string | null;
      version?: string | null;
      cpe?: string | null;
      method?: string | null;
      confidence?: number | null;
    } | null;
  }>;
  timestamp: string;
  cveEnrichment?: CVEEnrichment;
}): PortSnapshot[] {
  const { ports, timestamp, cveEnrichment } = params;

  const protocolMap = new Map<number, 'tcp' | 'udp'>();
  for (const port of ports) {
    protocolMap.set(port.port, port.protocol);
  }

  const enrichmentMap = buildPortEnrichmentMap(cveEnrichment, protocolMap);

  return ports.map((port) => {
    const key = `${port.protocol}/${port.port}`;
    const serviceData = port.service;
    const service = serviceData
      ? {
          name: serviceData.name ?? undefined,
          product: serviceData.product ?? null,
          version: serviceData.version ?? null,
          cpe: serviceData.cpe ?? null,
          method: serviceData.method ?? undefined,
          confidence: serviceData.confidence ?? undefined,
        }
      : null;

    return {
      port: port.port,
      protocol: port.protocol,
      state: port.state,
      service,
      metadata: {
        lastSeenAt: timestamp,
      },
      enrichment: enrichmentMap.get(key),
    };
  });
}

/**
 * Derives basic statistics about the stored ports for analytics/debugging.
 */
export function buildPortScanStats(params: {
  totalOpenPorts: number;
  portsWithService: number;
  portsStored: number;
  serviceDetectionRate: number;
  suspiciousAllPortsOpen: boolean;
}): {
  totalOpenPorts: number;
  portsWithService: number;
  portsStored: number;
  serviceDetectionRate: number;
  suspiciousAllPortsOpen: boolean;
  scanPattern: 'Possible WAF/Proxy' | 'Normal';
} {
  const {
    totalOpenPorts,
    portsWithService,
    portsStored,
    serviceDetectionRate,
    suspiciousAllPortsOpen,
  } = params;

  return {
    totalOpenPorts,
    portsWithService,
    portsStored,
    serviceDetectionRate,
    suspiciousAllPortsOpen,
    scanPattern: suspiciousAllPortsOpen ? 'Possible WAF/Proxy' : 'Normal',
  };
}
