import type { PortScanMode, DiscoveredPort } from '@repo/temporal/contracts';
import type { NormalizedPortScanInput } from '../input/normalizer';
import { mergePortLists, extractPortNumbers } from '../../../utilities/port-utils';

/**
 * Prescan policy logic for determining when and how to run prescans
 *
 * This module encapsulates the decision logic for Masscan and RustScan
 * prescans based on scan mode, input parameters, and policy configuration.
 */

/**
 * Port scan configuration for activities
 */
export interface PortScanConfig {
  protocol: 'tcp' | 'udp';
  timeout?: number;
  aggressive: boolean;
  mode: PortScanMode;
  profile: string;
  ports?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

/**
 * Resolves the scan mode from normalized input
 *
 * @param input - Normalized port scan input
 * @returns The determined scan mode
 */
export function resolveMode(input: NormalizedPortScanInput): PortScanMode {
  if (input.mode) {
    return input.mode;
  }

  if (input.isExtendScan) {
    return 'EXTEND';
  }

  switch (input.scanProfile) {
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

/**
 * Determines whether to run a prescan based on mode and input parameters
 *
 * @param input - Normalized port scan input
 * @param _tool - The prescan tool being considered ('masscan' | 'rustscan')
 * @returns True if prescan should be executed
 */
export function shouldRunPrescan(input: NormalizedPortScanInput, _tool: 'masscan' | 'rustscan'): boolean {
  const mode = resolveMode(input);

  if (mode === 'EXTEND') {
    return true;
  }

  if (mode === 'UPTIME') {
    return false;
  }

  // Discovery mode: only run if the workflow input explicitly opted in
  if (input.aggressive || input.requestedPorts?.length) {
    // Aggressive scans or explicit port targets opt-in to prescans even in discovery
    return true;
  }

  return false;
}

/**
 * Creates configuration for Masscan prescan
 *
 * @param input - Normalized port scan input
 * @returns Masscan configuration object
 */
export function createMasscanConfig(input: NormalizedPortScanInput): PortScanConfig {
  const mode = resolveMode(input);
  const portHints = mergePortLists(input.requestedPorts, input.seedPorts, input.historicPorts);

  return {
    protocol: 'tcp',
    // SECURITY: Don't override activity's safe timeout defaults unless explicitly provided
    // Leave undefined so activity can use MASSCAN_TIMEOUT_MS env var (default 120s)
    // Only set if caller explicitly provided a value larger than normalizer's 30s default
    timeout: input.timeout && input.timeout > 30000 ? input.timeout : undefined,
    aggressive: input.aggressive ?? mode === 'EXTEND',
    mode,
    profile: input.scanProfile,
    ports: portHints,
    seedPorts: input.seedPorts,
    historicPorts: input.historicPorts,
    additionalPortRanges: input.additionalPortRanges,
  };
}

/**
 * Creates configuration for RustScan prescan
 *
 * @param input - Normalized port scan input
 * @param masscanPorts - Results from previous Masscan run to include in port hints
 * @returns RustScan configuration object
 */
export function createRustscanConfig(
  input: NormalizedPortScanInput,
  masscanPorts: DiscoveredPort[],
): PortScanConfig {
  const mode = resolveMode(input);
  const masscanPortNumbers = extractPortNumbers(masscanPorts);
  const portHints = mergePortLists(
    input.requestedPorts,
    input.seedPorts,
    input.historicPorts,
    masscanPortNumbers,
  );

  return {
    protocol: 'tcp',
    timeout: input.timeout,
    aggressive: input.aggressive ?? mode === 'EXTEND',
    mode,
    profile: input.scanProfile,
    ports: portHints,
    seedPorts: input.seedPorts,
    historicPorts: input.historicPorts,
  };
}

/**
 * Gathers all port hints from input and prescan results
 *
 * @param input - Normalized port scan input
 * @param masscanPorts - Results from Masscan prescan
 * @param rustscanPorts - Results from RustScan prescan
 * @returns Combined port hints for Nmap execution
 */
export function gatherHintPorts(
  input: NormalizedPortScanInput,
  masscanPorts: DiscoveredPort[],
  rustscanPorts: DiscoveredPort[],
): number[] | undefined {
  return mergePortLists(
    input.requestedPorts,
    input.seedPorts,
    input.historicPorts,
    extractPortNumbers(masscanPorts),
    extractPortNumbers(rustscanPorts),
  );
}
