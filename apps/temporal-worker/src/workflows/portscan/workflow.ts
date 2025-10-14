/**
 * Database-Free Port Scan Workflow with Prescan Support
 * Returns results through Temporal (no database writes)
 *
 * Simple Flow:
 * 1. Run masscan (fast scan 1-65535) → finds open ports in ~30 seconds
 * 2. Run rustscan (fast scan, uses masscan hints) → validates/finds more
 * 3. Combine discoveries → dedupe to unique ports
 * 4. Run nmap ONLY on discovered ports (detailed service detection)
 * 5. Merge everything → return enriched results with attribution
 */

import { proxyActivities } from '@temporalio/workflow';
import type { DiscoveredPort } from '@repo/temporal/contracts';
import type { ScannerInput } from '@repo/contracts';
import { normalizePortScanInput } from './input/normalizer';
import { resolveMode, createMasscanConfig, createRustscanConfig } from './prescan/policy';
import { combinePreScanPorts, mergePreScanDiscoveries } from './merge/port-merger';

// Proxy ALL activities (workflow sandbox cannot import node:child_process)
interface ScanActivities {
  runMasscanScan: (target: string, config: any) => Promise<DiscoveredPort[]>;
  runRustscan: (target: string, config: any) => Promise<DiscoveredPort[]>;
  runNmapScan: (target: string, options: any) => Promise<any>;
}

const activities = proxyActivities<ScanActivities>({
  startToCloseTimeout: '5 minutes',
});

export interface PortScanInput {
  target: string;
  scanProfile?: 'PS_L1' | 'PS_L2' | 'PS_L3' | 'PS_L4' | 'PS_L5' | 'PS_L6';
  mode?: 'DISCOVERY' | 'EXTEND' | 'UPTIME';
  aggressive?: boolean;
  requestedPorts?: number[];
  seedPorts?: number[];
  historicPorts?: number[];
  additionalPortRanges?: string[];
}

export interface PortScanResult {
  target: string;
  ports: any[];
  osInfo?: any[];
  timing: {
    start: number;
    end: number;
    elapsed: number;
  };
  scanMetadata: {
    scanner: string;
    version: string;
    arguments: string;
    duration: number;
    resolvedTarget?: string;
  };
}

/**
 * Adapt ScannerInput (from web app) to PortScanInput (for scanning)
 */
function adaptScannerInput(input: ScannerInput | PortScanInput): PortScanInput {
  // If it's already PortScanInput (has 'target' string), return as-is
  if ('target' in input && typeof input.target === 'string') {
    return input as PortScanInput;
  }

  // Adapt from ScannerInput format
  const scannerInput = input as ScannerInput;
  const firstTarget = scannerInput.targets?.[0];

  if (!firstTarget?.value) {
    throw new Error('No valid target found in ScannerInput');
  }

  return {
    target: firstTarget.value,
    scanProfile: scannerInput.scanOptions?.profile,
    mode: scannerInput.scanOptions?.mode,
    aggressive: scannerInput.scanOptions?.aggressive,
    requestedPorts: scannerInput.scanOptions?.requestedPorts,
    seedPorts: scannerInput.scanOptions?.seedPorts,
    historicPorts: scannerInput.scanOptions?.historicPorts,
    additionalPortRanges: scannerInput.scanOptions?.additionalPortRanges,
  };
}

export async function portscanWorkflow(
  input: ScannerInput | PortScanInput
): Promise<PortScanResult> {
  // Adapt input to PortScanInput format
  const portScanInput = adaptScannerInput(input);

  // Validate input
  if (!portScanInput.target || portScanInput.target.trim() === '') {
    throw new Error('Target is required');
  }

  // Normalize input and determine mode
  const normalized = normalizePortScanInput({
    ...portScanInput,
    scanId: 'workflow', // Not needed for database-free workflow
  });
  const mode = resolveMode(normalized);

  // Step 1 & 2: Run prescans (fast port discovery)
  // Activities handle their own policy decisions based on:
  // - Feature flags (SCANNER_ENABLE_MASSCAN, SCANNER_ENABLE_RUSTSCAN)
  // - Mode-specific flags (SCANNER_ENABLE_UPTIME_PRESCANS, etc.)
  // - SCANNER_FORCE_PRESCANS override
  // They return [] gracefully when disabled, so we always call them.

  let masscanPorts: DiscoveredPort[] = [];
  let rustscanPorts: DiscoveredPort[] = [];

  // Masscan: Fast TCP scan 1-65535 (~30 seconds if enabled)
  masscanPorts = await activities.runMasscanScan(
    portScanInput.target,
    createMasscanConfig(normalized)
  );

  // Rustscan: Fast scan that can use masscan hints (if enabled)
  rustscanPorts = await activities.runRustscan(
    portScanInput.target,
    createRustscanConfig(normalized, masscanPorts)
  );

  // Step 3: Combine prescan discoveries (masscan found 5, rustscan found 7 → 10 unique)
  const prescanPorts = combinePreScanPorts(masscanPorts, rustscanPorts);

  // Step 4: Extract port numbers + include caller hints (requested/seed/historic)
  const prescanPortNumbers = prescanPorts.map(p => p.port);
  const callerHints = [
    ...(portScanInput.requestedPorts || []),
    ...(portScanInput.seedPorts || []),
    ...(portScanInput.historicPorts || []),
  ];

  // Combine and deduplicate
  const additionalPorts = Array.from(new Set([...prescanPortNumbers, ...callerHints]));

  // SECURITY: Validate all ports are in valid range
  const validPorts = additionalPorts.filter(p => Number.isInteger(p) && p >= 1 && p <= 65535);

  // Step 5: Run nmap on discovered ports + caller hints (fast because targeted)
  const nmapOptions = {
    profile: portScanInput.scanProfile,
    mode,
    additionalPorts: validPorts.length > 0 ? validPorts : undefined,
  };

  let scanResult = await activities.runNmapScan(portScanInput.target, nmapOptions);

  // Step 6: Merge discoveries and add attribution
  if (prescanPorts.length > 0) {
    // Merge prescan discoveries (add "discoveredBy: ['masscan', 'rustscan', 'nmap']")
    const merged = mergePreScanDiscoveries(
      { ports: scanResult.ports as any }, // Type compatibility - ports structures are equivalent
      prescanPorts
    );
    scanResult.ports = merged.ports as any;
  } else {
    // No prescans - add nmap attribution directly
    scanResult.ports = scanResult.ports.map((port: any) => ({
      ...port,
      discoveredBy: ['nmap'],
    }));
  }

  // Return enriched results (database-free)
  return {
    target: portScanInput.target,
    ports: scanResult.ports,
    osInfo: scanResult.osInfo,
    timing: {
      start: scanResult.scanMetadata.startTime,
      end: scanResult.scanMetadata.endTime,
      elapsed: scanResult.scanMetadata.duration,
    },
    scanMetadata: {
      scanner: scanResult.scanMetadata.scanner,
      version: scanResult.scanMetadata.version,
      arguments: scanResult.scanMetadata.args,
      duration: scanResult.scanMetadata.duration,
      resolvedTarget: scanResult.scanMetadata.resolvedTarget,
    },
  };
}
