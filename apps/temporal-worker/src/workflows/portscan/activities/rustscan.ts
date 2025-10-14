import { activityInfo, CancelledFailure } from '@temporalio/activity';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as dns } from 'node:dns';
import { createLogger } from '@repo/logger';
import { execFileWithHeartbeat } from '../../../utilities/heartbeat-helpers';
import type { DiscoveredPort, PortScanMode, ScanProfile } from '@repo/temporal/contracts';
import {
  ConcurrencyLimiter,
  InMemoryCircuitBreaker,
} from '../../../utilities/guardrails';
import {
  extractSingleHostResult,
  parseNmapMockXml,
  parseNmapXml,
  type ParsedNmapData,
  type ParsedPort,
} from '../xml-parser';

const logger = createLogger({ name: 'rustscan' });

const RUSTSCAN_FLAG = 'SCANNER_ENABLE_RUSTSCAN';
const RUSTSCAN_BINARY = process.env.RUSTSCAN_PATH || 'rustscan';
const RUSTSCAN_TIMEOUT = parseEnvInt(
  process.env.RUSTSCAN_TIMEOUT_MS,
  300000
);
const RUSTSCAN_ULIMIT = process.env.RUSTSCAN_ULIMIT || '6500';
const RUSTSCAN_DEFAULT_TIMEOUT = parseEnvInt(
  process.env.RUSTSCAN_SOCKET_TIMEOUT_MS,
  1500
);
const RUSTSCAN_MAX_CONCURRENCY = parseEnvInt(
  process.env.RUSTSCAN_MAX_CONCURRENCY,
  4
);
const RUSTSCAN_KILL_SIGNAL: NodeJS.Signals = 'SIGKILL';
const RUSTSCAN_CIRCUIT_THRESHOLD = Math.max(
  1,
  parseEnvInt(process.env.RUSTSCAN_CIRCUIT_BREAKER_THRESHOLD, 3)
);
const RUSTSCAN_CIRCUIT_WINDOW_MS = Math.max(
  1000,
  parseEnvInt(process.env.RUSTSCAN_CIRCUIT_BREAKER_WINDOW_MS, 15 * 60 * 1000)
);
const RUSTSCAN_CIRCUIT_COOLDOWN_MS = Math.max(
  1000,
  parseEnvInt(process.env.RUSTSCAN_CIRCUIT_BREAKER_COOLDOWN_MS, 5 * 60 * 1000)
);

const rustscanCircuitBreaker = new InMemoryCircuitBreaker({
  threshold: RUSTSCAN_CIRCUIT_THRESHOLD,
  windowMs: RUSTSCAN_CIRCUIT_WINDOW_MS,
  cooldownMs: RUSTSCAN_CIRCUIT_COOLDOWN_MS,
});

const rustscanConcurrencyLimiter = new ConcurrencyLimiter(
  RUSTSCAN_MAX_CONCURRENCY
);
const FORCE_PRESCANS = process.env.SCANNER_FORCE_PRESCANS === 'true';
const ENABLE_DISCOVERY_PRESCAN =
  process.env.SCANNER_ENABLE_DISCOVERY_PRESCANS === 'true';
const ENABLE_UPTIME_PRESCAN =
  process.env.SCANNER_ENABLE_UPTIME_PRESCANS === 'true';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEV_FIXTURE_PATH = path.join(__dirname, '../__tests__/fixtures/rustscan-sample.xml');

/**
 * Configuration for rustscan activity
 */
export interface RustscanConfig {
  protocol?: 'tcp' | 'udp' | 'both';
  timeout?: number;
  aggressive?: boolean;
  mode?: PortScanMode;
  profile?: ScanProfile;
  ports?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

/**
 * Execute rustscan against a target (database-free)
 * Returns discovered ports without persistence
 */
export async function runRustscan(
  target: string,
  params?: RustscanConfig
): Promise<DiscoveredPort[]> {
  const activityId = activityInfo().activityId;
  const isEnabled = process.env[RUSTSCAN_FLAG] === 'true';
  const mode = resolveMode(params?.mode, params?.profile);
  const hasExplicitPortHints = hasExplicitPorts(params);

  // Feature flag check
  if (!isEnabled) {
    logger.info(`[${activityId}] Rustscan disabled via feature flag`, {
      target,
      flag: RUSTSCAN_FLAG,
    });
    return [];
  }

  // Policy: Should we run rustscan for this scan mode?
  if (!shouldExecutePrescan(mode, hasExplicitPortHints)) {
    logger.info(`[${activityId}] Skipping rustscan prescan`, {
      target,
      mode,
      hasExplicitPortHints,
      reason: 'policy',
    });
    return [];
  }

  // Rustscan doesn't support UDP well
  if (params?.protocol === 'udp') {
    logger.warn(`[${activityId}] Rustscan does not support UDP only scans`, {
      target,
    });
    return [];
  }

  // Dev mode: return fixture data
  if (process.env.SCANNER_DEV_MODE === 'true') {
    logger.info(`[${activityId}] [DEV MODE] Loading rustscan fixture`, {
      target,
      fixturePath: DEV_FIXTURE_PATH,
    });

    try {
      const parsed = await parseNmapMockXml(DEV_FIXTURE_PATH);
      return transformParsedDataToPorts(parsed, ['rustscan', 'nmap']);
    } catch (error) {
      logger.error(
        `[${activityId}] [DEV MODE] Failed to parse rustscan fixture`,
        {
          target,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return createFallbackResults();
    }
  }

  const normalizedTarget = await resolveTarget(target);
  if (!normalizedTarget) {
    logger.warn('Invalid or unresolvable target for rustscan', { target });
    return []; // Graceful degradation
  }
  const scanTarget = normalizedTarget;

  // Circuit breaker check
  const circuitKey = buildCircuitKey(scanTarget);
  const circuitStatus = rustscanCircuitBreaker.getStatus(circuitKey);
  if (circuitStatus.isOpen) {
    logger.warn(
      `[${activityId}] Rustscan circuit breaker open, skipping execution`,
      {
        target,
        resolvedTarget: scanTarget,
        failureCount: circuitStatus.failureCount,
        blockedUntil: circuitStatus.blockedUntil
          ? new Date(circuitStatus.blockedUntil).toISOString()
          : undefined,
      }
    );
    return [];
  }

  const args = buildRustscanArgs(scanTarget, params);

  logger.info(`[${activityId}] Starting rustscan`, {
    target,
    resolvedTarget: scanTarget,
    args,
    binary: RUSTSCAN_BINARY,
  });

  // Run with concurrency limit
  return rustscanConcurrencyLimiter.run(async () => {
    try {
      // Execute with periodic heartbeats (every 30s) during long-running scan
      const { stdout } = await execFileWithHeartbeat(
        RUSTSCAN_BINARY,
        args,
        {
          timeout: RUSTSCAN_TIMEOUT,
          maxBuffer: 10 * 1024 * 1024,
          killSignal: RUSTSCAN_KILL_SIGNAL,
        },
        {
          tool: 'rustscan',
          target,
          scanTarget,
        }
      );

      // Try to parse XML output first (preferred)
      const xml = extractNmapXml(stdout);
      if (xml) {
        const parsed = await parseNmapXml(xml);
        const results = transformParsedDataToPorts(parsed, [
          'rustscan',
          'nmap',
        ]);
        rustscanCircuitBreaker.recordSuccess(circuitKey);
        logger.info(`[${activityId}] Rustscan completed with XML output`, {
          target,
          portsFound: results.length,
        });
        return results;
      }

      // Fallback to greppable output
      const fallback = parseGreppableOutput(stdout);
      if (fallback.length > 0) {
        rustscanCircuitBreaker.recordSuccess(circuitKey);
        logger.info(`[${activityId}] Rustscan completed without XML output`, {
          target,
          portsFound: fallback.length,
        });
        return fallback;
      }

      // No output - record failure in circuit breaker
      const failureStatus = rustscanCircuitBreaker.recordFailure(circuitKey);
      logger.warn(`[${activityId}] Rustscan produced no parsable output`, {
        target,
        failureCount: failureStatus.failureCount,
        circuitOpen: failureStatus.isOpen,
        blockedUntil: failureStatus.blockedUntil
          ? new Date(failureStatus.blockedUntil).toISOString()
          : undefined,
      });
      return [];
    } catch (error) {
      // Check if this is a Temporal cancellation - if so, rethrow immediately
      // Don't record as circuit breaker failure since it's not a tool problem
      if (error instanceof CancelledFailure) {
        logger.warn(`[${activityId}] Rustscan cancelled by Temporal`, {
          target,
          resolvedTarget: scanTarget,
          reason: 'Activity timeout or workflow cancellation',
        });
        throw error; // Propagate cancellation to workflow
      }

      // Real failure - record in circuit breaker
      const failureStatus = rustscanCircuitBreaker.recordFailure(circuitKey);
      logger.error(`[${activityId}] Rustscan failed`, {
        target,
        error: error instanceof Error ? error.message : String(error),
        failureCount: failureStatus.failureCount,
        circuitOpen: failureStatus.isOpen,
        blockedUntil: failureStatus.blockedUntil
          ? new Date(failureStatus.blockedUntil).toISOString()
          : undefined,
      });
      return [];
    }
  });
}

function buildRustscanArgs(target: string, params?: RustscanConfig): string[] {
  // Use RUSTSCAN_DEFAULT_TIMEOUT (1500ms) for socket timeout
  // params.timeout is for the entire scan activity, not per-port socket timeout
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

function resolveMode(mode?: PortScanMode, profile?: ScanProfile): PortScanMode {
  if (mode) {
    return mode;
  }

  switch (profile) {
    case 'PS_L2':
    case 'PS_L5':
      return 'EXTEND';
    case 'PS_L3':
    case 'PS_L4':
    case 'PS_L6':
      return 'UPTIME';
    default:
      return 'DISCOVERY';
  }
}

function hasExplicitPorts(params?: RustscanConfig): boolean {
  if (!params) {
    return false;
  }

  return Boolean(
    (params.ports && params.ports.length > 0) ||
      (params.seedPorts && params.seedPorts.length > 0) ||
      (params.historicPorts && params.historicPorts.length > 0)
  );
}

function shouldExecutePrescan(
  mode: PortScanMode,
  hasExplicitPortHints: boolean
): boolean {
  if (FORCE_PRESCANS) {
    return true;
  }

  if (mode === 'EXTEND') {
    return true;
  }

  if (mode === 'UPTIME') {
    return ENABLE_UPTIME_PRESCAN || hasExplicitPortHints;
  }

  // Discovery mode
  return ENABLE_DISCOVERY_PRESCAN || hasExplicitPortHints;
}

function transformParsedDataToPorts(
  data: ParsedNmapData,
  discoveredBy: string[]
): DiscoveredPort[] {
  const hostData = extractSingleHostResult(data);

  // Handle zero-port scans (valid result when no open ports found)
  if (!hostData) {
    return [];
  }

  const timestamp = Math.floor(Date.now() / 1000);

  return hostData.ports.map((port) => ({
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

function normalizePortState(
  state: ParsedPort['state'] | string | undefined
): 'open' | 'closed' | 'filtered' {
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
 * Examples: -a '--ulimit=0', --script=...
 */
async function resolveTarget(target: string): Promise<string | null> {
  const ipv4Regex =
    /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4Regex.test(target)) {
    return target;
  }

  // Validate hostname format (no special chars that could be flags)
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
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

function createFallbackResults(): DiscoveredPort[] {
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

function parseEnvInt(
  rawValue: string | undefined,
  defaultValue: number
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function buildCircuitKey(target: string): string {
  return `rustscan:${target.toLowerCase()}`;
}
