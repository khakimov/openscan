/**
 * Masscan Activity - Restate Implementation
 *
 * Fast TCP port scanner (1-65535 in ~30 seconds)
 * Ported from Temporal worker with simplified Restate patterns
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as dns } from 'node:dns';
import { createLogger } from '@repo/logger';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'masscan' });

const MASSCAN_FLAG = 'SCANNER_ENABLE_MASSCAN';
const MASSCAN_BINARY = process.env.MASSCAN_PATH || 'masscan';
const MASSCAN_DEFAULT_RATE = parseInt(process.env.MASSCAN_RATE || '5000', 10); // Fast scan rate
const MASSCAN_DEFAULT_PORTS = process.env.MASSCAN_PORT_RANGE || '1-65535'; // All ports
const MASSCAN_TIMEOUT = parseInt(process.env.MASSCAN_TIMEOUT_MS || '120000', 10);

export interface DiscoveredPort {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: {
    name?: string;
    product?: string;
    version?: string;
    extraInfo?: string;
    method?: string;
    confidence?: number;
    cpe?: string[];
  };
  discoveredBy: string[];
  firstSeen: number;
  lastSeen: number;
}

export interface MasscanConfig {
  protocol?: 'tcp' | 'udp' | 'both';
  timeout?: number;
  aggressive?: boolean;
  ports?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

/**
 * Execute masscan against a target
 * Returns discovered ports without persistence
 */
export async function runMasscan(
  target: string,
  params?: MasscanConfig,
): Promise<DiscoveredPort[]> {
  const isEnabled = process.env[MASSCAN_FLAG] === 'true';

  // Feature flag check
  if (!isEnabled) {
    logger.info('Masscan disabled via feature flag', {
      target,
      flag: MASSCAN_FLAG,
    });
    return [];
  }

  // Dev mode: return mock data
  if (process.env.SCANNER_DEV_MODE === 'true') {
    logger.info('[DEV MODE] Returning mock masscan ports', { target });
    return createMockMasscanPorts();
  }

  // Masscan doesn't support UDP well
  if (params?.protocol === 'udp') {
    logger.warn('Masscan does not support pure UDP mode', {
      target,
      protocol: params.protocol,
    });
    return [];
  }

  // Resolve target to IP address
  const normalizedTarget = await resolveTarget(target);
  if (!normalizedTarget) {
    logger.warn('Masscan skipping unresolved target', { target });
    return [];
  }

  const args = buildMasscanArgs(normalizedTarget, params);

  logger.info('Starting masscan', {
    target,
    normalizedTarget,
    args,
  });

  try {
    const { stdout } = await execFileAsync(MASSCAN_BINARY, args, {
      timeout: params?.timeout ?? MASSCAN_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024,
    });

    const results = parseMasscanOutput(stdout);

    logger.info('Masscan completed', {
      target,
      portsFound: results.length,
    });

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Masscan failed', {
      target,
      error: errorMessage,
    });
    return []; // Graceful degradation
  }
}

function buildMasscanArgs(target: string, params?: MasscanConfig): string[] {
  const rateMultiplier = params?.aggressive ? 5 : 1;
  const rate = Math.max(1, MASSCAN_DEFAULT_RATE * rateMultiplier);
  const portExpression = buildPortExpression(params);

  const args = [
    '-oJ',
    '-',
    '--rate',
    rate.toString(),
    '--wait',
    '0',
    `-p${portExpression}`,
  ];

  if (params?.protocol === 'both') {
    args.push('--ping');
  }

  args.push(target);
  return args;
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
    logger.warn('Masscan target lookup failed - rejecting', {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    // SECURITY: Return null instead of falling back to raw target
    return null;
  }
}

function parseMasscanOutput(output: string): DiscoveredPort[] {
  const trimmed = output.trim();
  if (!trimmed) return [];

  try {
    const data = JSON.parse(trimmed);
    return flattenMasscanJson(data);
  } catch (jsonError) {
    // Masscan sometimes outputs line-by-line JSON
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line !== '[' && line !== ']' && line !== ',');

    const parsedRecords = lines.map((line) => {
      const normalized = line.endsWith(',') ? line.slice(0, -1) : line;
      return JSON.parse(normalized);
    });

    return flattenMasscanJson(parsedRecords);
  }
}

function flattenMasscanJson(records: any): DiscoveredPort[] {
  const array = Array.isArray(records) ? records : [records];

  const timestamp = Math.floor(Date.now() / 1000);
  const ports: DiscoveredPort[] = [];
  for (const entry of array) {
    const entryPorts = Array.isArray(entry?.ports) ? entry.ports : [];
    for (const port of entryPorts) {
      if (typeof port?.port !== 'number') continue;
      ports.push({
        port: port.port,
        protocol: (port.proto || 'tcp') as 'tcp' | 'udp',
        state: (port.status || 'open') as 'open' | 'closed' | 'filtered',
        discoveredBy: ['masscan'],
        firstSeen: timestamp,
        lastSeen: timestamp,
      });
    }
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

function buildPortExpression(params?: MasscanConfig): string {
  if (!params) {
    return MASSCAN_DEFAULT_PORTS;
  }

  const numericPorts = mergeNumberLists(params.ports, params.seedPorts, params.historicPorts);
  const rangeSegments = sanitizeRangeSegments(params.additionalPortRanges);

  const segments: string[] = [];
  if (numericPorts.length > 0) {
    segments.push(compressPortList(numericPorts));
  }

  if (rangeSegments.length > 0) {
    segments.push(...rangeSegments);
  }

  if (segments.length === 0) {
    return MASSCAN_DEFAULT_PORTS;
  }

  return segments.join(',');
}

function mergeNumberLists(...lists: Array<number[] | undefined>): number[] {
  const merged = new Set<number>();

  for (const list of lists) {
    if (!list) {
      continue;
    }

    for (const value of list) {
      if (Number.isInteger(value) && value >= 1 && value <= 65535) {
        merged.add(value);
      }
    }
  }

  const result = Array.from(merged.values());
  result.sort((a, b) => a - b);
  return result;
}

/**
 * SECURITY: Validate port range segments to prevent masscan errors
 */
function sanitizeRangeSegments(segments?: string[]): string[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  const valid: string[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) continue;

    // Parse segment (single port or range)
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length !== 2) continue;

      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);

      // Validate bounds and ordering
      if (
        !Number.isNaN(start) &&
        !Number.isNaN(end) &&
        start >= 1 &&
        start <= 65535 &&
        end >= 1 &&
        end <= 65535 &&
        start <= end
      ) {
        valid.push(`${start}-${end}`);
      }
    } else {
      const port = parseInt(trimmed, 10);
      if (!Number.isNaN(port) && port >= 1 && port <= 65535) {
        valid.push(`${port}`);
      }
    }
  }

  return Array.from(new Set(valid));
}

function compressPortList(ports: number[]): string {
  if (ports.length === 0) {
    return '';
  }

  const segments: string[] = [];
  let rangeStart = ports[0];
  let previous = ports[0];

  for (let index = 1; index < ports.length; index += 1) {
    const current = ports[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    segments.push(formatRange(rangeStart, previous));
    rangeStart = current;
    previous = current;
  }

  segments.push(formatRange(rangeStart, previous));
  return segments.join(',');
}

function formatRange(start: number, end: number): string {
  if (start === end) {
    return `${start}`;
  }
  return `${start}-${end}`;
}

function createMockMasscanPorts(): DiscoveredPort[] {
  const timestamp = Math.floor(Date.now() / 1000);
  return [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['masscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
    {
      port: 80,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['masscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      discoveredBy: ['masscan'],
      firstSeen: timestamp,
      lastSeen: timestamp,
    },
  ];
}
