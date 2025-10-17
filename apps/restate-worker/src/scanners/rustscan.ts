/**
 * Rustscan Activity - Restate Implementation
 *
 * Fast TCP port scanner that uses nmap for service detection
 * Ported from Temporal worker with simplified Restate patterns
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as dns } from 'node:dns';
import { createLogger } from '@repo/logger';
import { parseNmapXml } from '../xml-parser';
import type { DiscoveredPort } from './masscan';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'rustscan' });

const RUSTSCAN_FLAG = 'SCANNER_ENABLE_RUSTSCAN';
const RUSTSCAN_BINARY = process.env.RUSTSCAN_PATH || 'rustscan';
const RUSTSCAN_TIMEOUT = parseInt(process.env.RUSTSCAN_TIMEOUT_MS || '300000', 10);
const RUSTSCAN_ULIMIT = process.env.RUSTSCAN_ULIMIT || '6500';
const RUSTSCAN_DEFAULT_TIMEOUT = parseInt(process.env.RUSTSCAN_SOCKET_TIMEOUT_MS || '1500', 10);

export interface RustscanConfig {
  protocol?: 'tcp' | 'udp' | 'both';
  timeout?: number;
  aggressive?: boolean;
  ports?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

/**
 * Execute rustscan against a target
 * Returns discovered ports without persistence
 */
export async function runRustscan(
  target: string,
  params?: RustscanConfig,
): Promise<DiscoveredPort[]> {
  const isEnabled = process.env[RUSTSCAN_FLAG] === 'true';

  // Feature flag check
  if (!isEnabled) {
    logger.info('Rustscan disabled via feature flag', {
      target,
      flag: RUSTSCAN_FLAG,
    });
    return [];
  }

  // Dev mode: return mock data
  if (process.env.SCANNER_DEV_MODE === 'true') {
    logger.info('[DEV MODE] Returning mock rustscan ports', { target });
    return createMockRustscanPorts();
  }

  // Rustscan doesn't support UDP well
  if (params?.protocol === 'udp') {
    logger.warn('Rustscan does not support UDP only scans', { target });
    return [];
  }

  const normalizedTarget = await resolveTarget(target);
  if (!normalizedTarget) {
    logger.warn('Invalid or unresolvable target for rustscan', { target });
    return []; // Graceful degradation
  }
  const scanTarget = normalizedTarget;

  const args = buildRustscanArgs(scanTarget, params);

  logger.info('Starting rustscan', {
    target,
    resolvedTarget: scanTarget,
    args,
    binary: RUSTSCAN_BINARY,
  });

  try {
    const { stdout } = await execFileAsync(RUSTSCAN_BINARY, args, {
      timeout: RUSTSCAN_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
      killSignal: 'SIGKILL',
    });

    // Try to parse XML output first (preferred)
    const xml = extractNmapXml(stdout);
    if (xml) {
      const parsed = await parseNmapXml(xml);
      const results = transformParsedDataToPorts(parsed, ['rustscan', 'nmap']);
      logger.info('Rustscan completed with XML output', {
        target,
        portsFound: results.length,
      });
      return results;
    }

    // Fallback to greppable output
    const fallback = parseGreppableOutput(stdout);
    if (fallback.length > 0) {
      logger.info('Rustscan completed without XML output', {
        target,
        portsFound: fallback.length,
      });
      return fallback;
    }

    logger.warn('Rustscan produced no parsable output', { target });
    return [];
  } catch (error) {
    logger.error('Rustscan failed', {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    return []; // Graceful degradation
  }
}

function buildRustscanArgs(target: string, params?: RustscanConfig): string[] {
  const timeoutArg = RUSTSCAN_DEFAULT_TIMEOUT;

  const args: string[] = [
    '--no-banner',
    '--accessible',
    '--no-config',
    '-a',
    target,
    '--timeout',
    timeoutArg.toString(),
  ];

  if (RUSTSCAN_ULIMIT) {
    args.push('--ulimit', RUSTSCAN_ULIMIT);
  }

  const explicitPorts = collectRustscanPorts(params);
  if (explicitPorts.length > 0) {
    args.push('--ports', explicitPorts.join(','));
  }

  // Always run Nmap with XML output to stdout so we can reuse the parser.
  args.push('--scripts', 'default');
  args.push('--');
  args.push('-sV', '-Pn', '-oX', '-');

  return args;
}

function collectRustscanPorts(params?: RustscanConfig): number[] {
  if (!params) {
    return [];
  }

  const merged = new Set<number>();
  const sources: Array<number[] | undefined> = [
    params.ports,
    params.seedPorts,
    params.historicPorts,
  ];

  for (const list of sources) {
    if (!list) {
      continue;
    }
    for (const port of list) {
      if (Number.isInteger(port) && port >= 1 && port <= 65535) {
        merged.add(port);
      }
    }
  }

  const result = Array.from(merged.values());
  result.sort((a, b) => a - b);
  return result;
}

function transformParsedDataToPorts(data: any, discoveredBy: string[]): DiscoveredPort[] {
  // Extract first host from parsed nmap data
  const hostAddresses = Object.keys(data.hosts || {});
  if (hostAddresses.length === 0) {
    return [];
  }

  const hostData = data.hosts[hostAddresses[0]];
  if (!hostData || !hostData.ports) {
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000);

  return hostData.ports.map((port: any) => ({
    port: port.port,
    protocol: (port.transportProtocol || 'tcp') as 'tcp' | 'udp',
    state: normalizePortState(port.state),
    service: port.service
      ? {
          name: port.service.name,
          product: port.service.product,
          version: port.service.version,
          extraInfo: port.service.extraInfo,
          method: port.service.method,
          confidence: port.service.conf,
        }
      : undefined,
    discoveredBy: Array.from(new Set(discoveredBy)),
    firstSeen: timestamp,
    lastSeen: timestamp,
  }));
}

function normalizePortState(state: string | undefined): 'open' | 'closed' | 'filtered' {
  if (state === 'open' || state === 'closed' || state === 'filtered') {
    return state;
  }

  if (typeof state === 'string' && state.includes('open')) {
    return 'open';
  }

  return 'filtered';
}

/**
 * SECURITY: Validate target to prevent flag injection
 */
async function resolveTarget(target: string): Promise<string | null> {
  const ipv4Regex =
    /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4Regex.test(target)) {
    return target;
  }

  // Validate hostname format (no special chars that could be flags)
  const hostnameRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!hostnameRegex.test(target)) {
    logger.warn('Invalid target format - rejecting', { target });
    return null;
  }

  try {
    const lookup = await dns.lookup(target, { family: 4 });
    return lookup.address;
  } catch (error) {
    logger.warn('Rustscan target lookup failed - rejecting', {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    // SECURITY: Return null instead of falling back to raw target
    return null;
  }
}

function extractNmapXml(output: string): string | null {
  const start = output.indexOf('<?xml');
  const end = output.lastIndexOf('</nmaprun>');

  if (start === -1 || end === -1) {
    return null;
  }

  return output.slice(start, end + '</nmaprun>'.length);
}

function parseGreppableOutput(output: string): DiscoveredPort[] {
  const timestamp = Math.floor(Date.now() / 1000);
  const lines = output.split(/\r?\n/);
  const ports: DiscoveredPort[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Rustscan greppable output typically looks like "Open <ip>:<port>".
    const match = line.match(/Open\s+[\w.-]+:(\d{1,5})/i);
    if (!match) continue;

    const portNumber = Number.parseInt(match[1], 10);
    if (Number.isNaN(portNumber)) continue;

    ports.push({
      port: portNumber,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['rustscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    });
  }

  return dedupePorts(ports);
}

function dedupePorts(ports: DiscoveredPort[]): DiscoveredPort[] {
  const seen = new Map<string, DiscoveredPort>();
  for (const port of ports) {
    const key = `${port.protocol}:${port.port}`;
    if (!seen.has(key)) {
      seen.set(key, port);
    }
  }
  return Array.from(seen.values());
}

function createMockRustscanPorts(): DiscoveredPort[] {
  const timestamp = Math.floor(Date.now() / 1000);
  return [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['rustscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
    {
      port: 80,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['rustscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['rustscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
  ];
}
