/**
 * Nmap scanning activities - database-free
 * Adapted from old worker - keeps all scanning complexity
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as dns } from 'node:dns';
import { createLogger } from '@repo/logger';
import { parseNmapXml, extractSingleHostResult, type ParsedNmapData } from './xml-parser';

const logger = createLogger({ name: 'nmap-scan' });
const execFileAsync = promisify(execFile);

const NMAP_BINARY = process.env.NMAP_PATH || 'nmap';
export const NMAP_BASE_PORT_RANGE = process.env.NMAP_BASE_PORT_RANGE || '1-1000';

// Types
export type PortScanMode = 'DISCOVERY' | 'EXTEND' | 'UPTIME';
export type ScanProfile = 'QUICK' | 'NORMAL' | 'STEALTH' | 'FULL';
export type AuthScanType = 'ANONYMOUS' | 'AUTHENTICATED';

export interface PortScanResult {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: {
    name?: string;
    product?: string | null;
    version?: string | null;
    extraInfo?: string | null;
    method?: string;
    confidence?: number;
    tunnel?: string;
    cpe?: string[];
    fingerprint?: string;
  };
}

export interface OsDetectionResult {
  name: string;
  accuracy: number;
  vendor?: string;
  family?: string;
  generation?: string;
  type?: string;
}

export interface NmapScanResult {
  ports: PortScanResult[];
  osInfo?: OsDetectionResult[];
  scanMetadata: {
    target: string;
    resolvedTarget?: string;
    startTime: number;
    endTime: number;
    duration: number;
    scanner: string;
    version: string;
    args: string;
    retryCount?: number;
    attempts?: Array<{ id: string; args: string }>;
  };
  runStats?: {
    finished: {
      time: number;
      timeStr: string;
      summary: string;
      elapsed: number;
      exit: string;
    };
    hosts: {
      up: number;
      down: number;
      total: number;
    };
  };
}

export interface NmapRunOptions {
  additionalPorts?: number[];
  mode?: PortScanMode;
  profile?: ScanProfile;
  authScanType?: AuthScanType;
}

type NmapExecutionTemplate =
  | 'discovery-default'
  | 'extend-aggressive'
  | 'extend-normal'
  | 'extend-sneaky'
  | 'snmp-probe';

interface ExecutionAttempt {
  id: string;
  template: NmapExecutionTemplate;
  useFilteredPortsOnly?: boolean;
  allowHostDiscoveryFallback?: boolean;
}

/**
 * Main nmap scan function - keeps all complexity from old worker
 */
export async function runNmapScan(
  target: string,
  options?: NmapRunOptions
): Promise<NmapScanResult> {
  // Dev mode - use mock XML file for testing
  if (process.env.SCANNER_DEV_MODE === 'true' || process.env.NODE_ENV === 'test') {
    logger.info('[DEV MODE] Using mock nmap XML', { target });

    const mockXmlPath = new URL(
      './xml-parser/__tests__/fixtures/nmap-sample.xml',
      import.meta.url
    );
    const fs = await import('node:fs/promises');
    const mockXml = await fs.readFile(mockXmlPath, 'utf-8');

    const parsedData = await parseNmapXml(mockXml);
    const result = transformParsedDataToResult(parsedData, target, target);

    logger.info('[DEV MODE] Mock nmap scan completed', {
      target,
      portsFound: result.ports.length,
      osMatches: result.osInfo?.length || 0,
    });

    return result;
  }

  // Resolve target (SECURITY: Reject if validation fails)
  const normalizedTarget = await resolveTarget(target);
  if (!normalizedTarget) {
    throw new Error(`Invalid or unresolvable target: ${target}`);
  }
  const scanTarget = normalizedTarget;
  const mode = resolveRequestedMode(options?.mode, options?.profile);
  const executionPlan = buildExecutionPlan(mode);
  const attemptHistory: Array<{ id: string; args: string }> = [];

  let combinedResult: NmapScanResult | undefined;
  let filteredPorts: number[] | undefined;
  let retryCount = 0;

  // Execute scan plan (may include multiple attempts)
  for (const attempt of executionPlan) {
    const portSource = attempt.useFilteredPortsOnly ? filteredPorts : options?.additionalPorts;
    if (attempt.useFilteredPortsOnly && (!portSource || portSource.length === 0)) {
      continue;
    }

    const portArgument = attempt.useFilteredPortsOnly
      ? buildExplicitPortArgument(portSource!)
      : buildPortArgument(options?.additionalPorts);

    const attemptArgs = buildArgsForTemplate(attempt.template, portArgument, scanTarget);
    const fallbackArgs = attempt.allowHostDiscoveryFallback
      ? buildArgsForTemplate(attempt.template, portArgument, scanTarget, { disableHostDiscovery: true })
      : undefined;

    const attemptResult = await runNmapAttempt({
      attemptId: attempt.id,
      template: attempt.template,
      args: attemptArgs,
      target,
      resolvedTarget: scanTarget,
      fallbackArgs,
    });

    attemptHistory.push({
      id: attempt.id,
      args: attemptResult.scanMetadata.args,
    });

    if (!combinedResult) {
      combinedResult = attemptResult;
    } else {
      combinedResult = mergeNmapResults(combinedResult, attemptResult);
    }

    filteredPorts = mode === 'EXTEND' ? getFilteredTcpPorts(combinedResult) : undefined;

    if (!filteredPorts || filteredPorts.length === 0) {
      break;
    }

    retryCount += 1;
  }

  if (!combinedResult) {
    throw new Error('Nmap scan produced no result');
  }

  // SNMP probe for authenticated EXTEND scans
  if (mode === 'EXTEND' && options?.authScanType === 'AUTHENTICATED') {
    logger.info('Running SNMP probe for authenticated scan', { target, scanTarget });
    const snmpResult = await runSnmpProbe({
      target,
      resolvedTarget: scanTarget,
      mode,
      authScanType: options.authScanType,
    });

    if (snmpResult) {
      combinedResult = mergeNmapResults(combinedResult, snmpResult);
      attemptHistory.push({
        id: 'extend-snmp-probe',
        args: snmpResult.scanMetadata.args,
      });
    }
  }

  combinedResult.scanMetadata.retryCount = retryCount;
  combinedResult.scanMetadata.attempts = attemptHistory;

  return combinedResult;
}

/**
 * Execute single nmap attempt
 */
async function runNmapAttempt({
  attemptId,
  template,
  args,
  target,
  resolvedTarget,
  fallbackArgs,
}: {
  attemptId: string;
  template: NmapExecutionTemplate;
  args: string[];
  target: string;
  resolvedTarget: string;
  fallbackArgs?: string[];
}): Promise<NmapScanResult> {
  const execute = async (execArgs: string[], label: string): Promise<NmapScanResult> => {
    logger.info('Starting nmap scan', {
      target,
      resolvedTarget,
      template,
      attempt: label,
      binary: NMAP_BINARY,
      args: execArgs,
    });

    // Use execFile with args array - prevents command injection
    const { stdout } = await execFileAsync(NMAP_BINARY, execArgs, {
      timeout: 300000, // 5 minutes
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const parsedData = await parseNmapXml(stdout);
    const result = transformParsedDataToResult(parsedData, target, resolvedTarget);

    logger.info('Nmap scan completed', {
      target,
      resolvedTarget,
      template,
      attempt: label,
      portsFound: result.ports.length,
      osMatches: result.osInfo?.length || 0,
      duration: result.scanMetadata.duration,
    });

    return result;
  };

  try {
    return await execute(args, attemptId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const shouldFallback = fallbackArgs && errorMessage.includes('no host data found');

    if (shouldFallback) {
      const fallbackLabel = `${attemptId}-skip-host-discovery`;
      logger.warn('Nmap XML contained no host data, retrying with -Pn', {
        target,
        resolvedTarget,
        template,
        attempt: fallbackLabel,
        args: fallbackArgs,
      });
      return execute(fallbackArgs, fallbackLabel);
    }

    logger.error('Nmap scan failed', {
      target,
      resolvedTarget,
      template,
      attempt: attemptId,
      error: errorMessage,
      args,
    });
    throw new Error(`Nmap scan failed: ${errorMessage}`);
  }
}

/**
 * SNMP probe for authenticated scans
 */
async function runSnmpProbe({
  target,
  resolvedTarget,
}: {
  target: string;
  resolvedTarget: string;
  mode: PortScanMode;
  authScanType: AuthScanType;
}): Promise<NmapScanResult | null> {
  const portArgument = buildExplicitPortArgument([161]);
  const args = buildArgsForTemplate('snmp-probe', portArgument, resolvedTarget);

  try {
    const result = await runNmapAttempt({
      attemptId: 'extend-snmp-probe',
      template: 'snmp-probe',
      args,
      target,
      resolvedTarget,
    });
    logger.info('SNMP probe succeeded', { target, resolvedTarget });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('SNMP probe failed', { target, resolvedTarget, error: errorMessage });
    return null;
  }
}

/**
 * Resolve mode from profile
 */
function resolveRequestedMode(mode?: PortScanMode, profile?: ScanProfile): PortScanMode {
  if (mode) return mode;

  switch (profile) {
    case 'STEALTH':
    case 'FULL':
      return 'EXTEND';
    default:
      return 'DISCOVERY';
  }
}

/**
 * Build execution plan based on mode
 */
function buildExecutionPlan(mode: PortScanMode): ExecutionAttempt[] {
  if (mode === 'EXTEND') {
    return [
      { id: 'extend-initial', template: 'extend-aggressive' },
      { id: 'extend-retry-normal', template: 'extend-normal', useFilteredPortsOnly: true },
      { id: 'extend-retry-sneaky', template: 'extend-sneaky', useFilteredPortsOnly: true },
    ];
  }

  if (mode === 'UPTIME') {
    return [{ id: 'uptime-default', template: 'discovery-default' }];
  }

  return [
    { id: 'discovery-default', template: 'discovery-default', allowHostDiscoveryFallback: true },
  ];
}

/**
 * Build nmap arguments for template
 */
function buildArgsForTemplate(
  template: NmapExecutionTemplate,
  portArgument: string,
  target: string,
  overrides?: { disableHostDiscovery?: boolean }
): string[] {
  switch (template) {
    case 'extend-aggressive':
      return ['-sT', '-sV', '-Pn', '-T5', '-O', portArgument, '--open', '--max-retries', '1', '-oX', '-', target];
    case 'extend-normal':
      return ['-sT', '-sV', '-Pn', '-T3', portArgument, '--open', '--max-retries', '2', '-oX', '-', target];
    case 'extend-sneaky':
      return ['-sT', '-sV', '-Pn', '-T1', portArgument, '--open', '--max-retries', '1', '-oX', '-', target];
    case 'snmp-probe':
      return ['-sU', '-Pn', '-T4', portArgument, '--open', '--max-retries', '1', '-oX', '-', target];
    case 'discovery-default':
    default:
      return buildNmapArgs(portArgument, target, overrides);
  }
}

function buildNmapArgs(
  portArgument: string,
  target: string,
  options?: { disableHostDiscovery?: boolean }
): string[] {
  const args = ['-sS', '-O', '-sV', '-T4', portArgument, '--open'];
  if (options?.disableHostDiscovery) {
    args.push('-Pn');
  }
  args.push('-oX', '-', target);
  return args;
}

/**
 * Port argument builders
 */
function buildPortArgument(additionalPorts?: number[]): string {
  const baseRange = NMAP_BASE_PORT_RANGE;
  if (!additionalPorts || additionalPorts.length === 0) {
    return `-p${baseRange}`;
  }

  const baseRanges = parsePortRanges(baseRange);
  const sanitized = Array.from(new Set(additionalPorts))
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
    .sort((a, b) => a - b);

  const extras = sanitized.filter((port) => !isPortCoveredByBaseRanges(port, baseRanges));

  if (!extras.length) {
    return `-p${baseRange}`;
  }

  return `-p${baseRange},${compressPortList(extras)}`;
}

function buildExplicitPortArgument(ports: number[]): string {
  const sanitized = Array.from(new Set(ports.filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535))).sort(
    (a, b) => a - b
  );
  if (sanitized.length === 0) {
    return `-p${NMAP_BASE_PORT_RANGE}`;
  }
  return `-p${compressPortList(sanitized)}`;
}

/**
 * Port utilities
 */
interface PortRange {
  start: number;
  end: number;
}

function parsePortRanges(rangeExpression: string): PortRange[] {
  return rangeExpression
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment.includes('-')) {
        const [startRaw, endRaw] = segment.split('-');
        const start = Number.parseInt(startRaw, 10);
        const end = Number.parseInt(endRaw, 10);
        if (Number.isNaN(start) || Number.isNaN(end)) return null;
        return { start: Math.min(start, end), end: Math.max(start, end) };
      }
      const value = Number.parseInt(segment, 10);
      if (Number.isNaN(value)) return null;
      return { start: value, end: value };
    })
    .filter((range): range is PortRange => range !== null);
}

function isPortCoveredByBaseRanges(port: number, ranges: PortRange[]): boolean {
  return ranges.some((range) => port >= range.start && port <= range.end);
}

function compressPortList(ports: number[]): string {
  if (ports.length === 0) return '';

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
  return start === end ? `${start}` : `${start}-${end}`;
}

/**
 * Result merging
 */
function mergeNmapResults(base: NmapScanResult, incoming: NmapScanResult): NmapScanResult {
  const portMap = new Map<string, PortScanResult>();

  const addPort = (port: PortScanResult) => {
    const key = `${port.protocol}:${port.port}`;
    portMap.set(key, { ...port });
  };

  base.ports.forEach(addPort);

  incoming.ports.forEach((port) => {
    const key = `${port.protocol}:${port.port}`;
    const existing = portMap.get(key);
    if (!existing) {
      portMap.set(key, { ...port });
      return;
    }
    portMap.set(key, mergePortRecords(existing, port));
  });

  const mergedPorts = Array.from(portMap.values()).sort((a, b) => {
    if (a.protocol === b.protocol) return a.port - b.port;
    return a.protocol === 'tcp' ? -1 : 1;
  });

  return {
    ports: mergedPorts,
    osInfo: base.osInfo?.length ? base.osInfo : incoming.osInfo,
    scanMetadata: {
      ...base.scanMetadata,
      startTime: Math.min(base.scanMetadata.startTime, incoming.scanMetadata.startTime),
      endTime: Math.max(base.scanMetadata.endTime, incoming.scanMetadata.endTime),
      duration: Math.max(base.scanMetadata.duration, incoming.scanMetadata.duration),
    },
    runStats: base.runStats ?? incoming.runStats,
  };
}

function mergePortRecords(existing: PortScanResult, incoming: PortScanResult): PortScanResult {
  const statePriority: Record<PortScanResult['state'], number> = {
    open: 3,
    closed: 2,
    filtered: 1,
  };

  const preferred = statePriority[incoming.state] > statePriority[existing.state] ? incoming : existing;

  return {
    port: existing.port,
    protocol: existing.protocol,
    state: preferred.state,
    service: incoming.service ?? existing.service,
  };
}

function getFilteredTcpPorts(result: NmapScanResult): number[] | undefined {
  const filtered = result.ports
    .filter((port) => port.protocol === 'tcp' && port.state === 'filtered')
    .map((port) => port.port);

  if (filtered.length === 0) return undefined;
  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

/**
 * Target resolution with validation
 *
 * SECURITY: Never return raw target on DNS failure - it could contain flag injection
 * Examples: --script=http-sql-injection, --datadir=/tmp/...
 */
async function resolveTarget(target: string): Promise<string | null> {
  const ipv4Regex = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4Regex.test(target)) return target;

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
    logger.warn('Target lookup failed - rejecting', {
      target,
      error: error instanceof Error ? error.message : String(error),
    });
    // SECURITY: Return null instead of falling back to raw target
    return null;
  }
}

/**
 * Transform parsed XML to result format
 */
function transformParsedDataToResult(
  parsedData: ParsedNmapData,
  target: string,
  resolvedTarget?: string
): NmapScanResult {
  const hostData = extractSingleHostResult(parsedData);

  if (!hostData) {
    return {
      ports: [],
      osInfo: undefined,
      scanMetadata: {
        target,
        resolvedTarget,
        startTime: parsedData.timing.start,
        endTime: parsedData.timing.end,
        duration: parsedData.runStats?.finished?.elapsed || parsedData.timing.elapsed,
        scanner: parsedData.scanner,
        version: parsedData.version,
        args: parsedData.args,
      },
      runStats: parsedData.runStats,
    };
  }

  const ports: PortScanResult[] = hostData.ports.map((port) => ({
    port: port.port,
    protocol: port.transportProtocol,
    state: port.state,
    service: port.service
      ? {
          name: port.service.name,
          product: port.service.product,
          version: port.service.version,
          extraInfo: port.service.extraInfo,
          method: port.service.method,
          confidence: port.service.conf,
          tunnel: port.service.tunnel,
          cpe: port.service.cpe,
          fingerprint: port.service.fingerprint,
        }
      : undefined,
  }));

  let osInfo: OsDetectionResult[] | undefined;
  if (hostData.osInfo?.matches && hostData.osInfo.matches.length > 0) {
    osInfo = hostData.osInfo.matches.map((match) => {
      const result: OsDetectionResult = {
        name: match.name,
        accuracy: match.accuracy,
      };

      if (match.osclass && match.osclass.length > 0) {
        const osclass = match.osclass[0];
        result.vendor = osclass.vendor;
        result.family = osclass.osfamily;
        result.generation = osclass.osgen;
        result.type = osclass.type;
      }

      return result;
    });
  }

  return {
    ports,
    osInfo,
    scanMetadata: {
      target,
      resolvedTarget,
      startTime: parsedData.timing.start,
      endTime: parsedData.timing.end,
      duration: parsedData.runStats?.finished?.elapsed || parsedData.timing.elapsed,
      scanner: parsedData.scanner,
      version: parsedData.version,
      args: parsedData.args,
    },
    runStats: parsedData.runStats,
  };
}
