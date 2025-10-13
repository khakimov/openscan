import { activityInfo } from '@temporalio/activity';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@repo/logger';
import type {
  ScanTarget,
  DiscoveredDevice,
  ScanScope,
} from '@repo/temporal/contracts';
import { getMockDiscoveryResults } from '../mock-data/discovery';

const execFileAsync = promisify(execFile);
const logger = createLogger({ name: 'subdomain-discovery' });

// Helper to find tool in PATH or common Go locations
function findTool(toolName: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const paths = [
    toolName, // Try PATH first
    `${homeDir}/go/bin/${toolName}`,
    `/usr/local/bin/${toolName}`,
    `/usr/bin/${toolName}`,
  ];
  return paths[0]; // Let execFile resolve from PATH
}

// Overload for single target with default tools
export async function runSubdomainDiscovery(
  target: ScanTarget
): Promise<DiscoveredDevice[]>;
export async function runSubdomainDiscovery(
  target: ScanTarget,
  tools: Array<'subfinder' | 'amass' | 'assetfinder'>
): Promise<DiscoveredDevice[]>;

/**
 * Run subdomain discovery using specified tools
 * Database-agnostic: Only returns discovered devices, no persistence
 */
export async function runSubdomainDiscovery(
  target: ScanTarget,
  tools: Array<'subfinder' | 'amass' | 'assetfinder'> = [
    'subfinder',
    'assetfinder',
  ]
): Promise<DiscoveredDevice[]> {
  const activityId = activityInfo().activityId;

  // Development mode - return mock data quickly
  if (process.env.SCANNER_DEV_MODE === 'true') {
    const sleepSeconds = parseInt(process.env.SCANNER_DEV_SLEEP_SECONDS || '5');

    logger.info(`[${activityId}] [DEV MODE] Starting mock subdomain discovery`, {
      target: target.value,
      sleepSeconds,
      tools,
    });

    // Simulate work with configurable sleep
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));

    const mockDevices = getMockDiscoveryResults(target.value);

    logger.info(`[${activityId}] [DEV MODE] Mock subdomain discovery completed`, {
      target: target.value,
      devicesFound: mockDevices.length,
      devices: mockDevices.map((d) => ({
        hostname: d.hostname,
        ip: d.ipAddress,
      })),
    });

    return mockDevices;
  }

  // Production mode - run actual tools
  logger.info(`[${activityId}] Starting subdomain discovery`, {
    target: target.value,
    tools,
  });

  const allDevices: DiscoveredDevice[] = [];
  const errors: string[] = [];

  // Run each tool in sequence (could be parallelized for speed)
  for (const tool of tools) {
    try {
      logger.info(`[${activityId}] Running ${tool} for ${target.value}`);
      const devices = await runDiscoveryTool(tool, target.value, 'EXTERNAL');
      allDevices.push(...devices);

      logger.info(`[${activityId}] ${tool} found ${devices.length} subdomains`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`${tool} failed: ${errorMessage}`);
      logger.warn(`[${activityId}] ${tool} failed`, { error: errorMessage });

      // Continue with other tools instead of failing completely
      continue;
    }
  }

  // Deduplicate by hostname
  const uniqueDevices = deduplicateByHostname(allDevices);

  logger.info(`[${activityId}] Subdomain discovery completed`, {
    target: target.value,
    totalFound: allDevices.length,
    uniqueFound: uniqueDevices.length,
    tools: tools.join(', '),
    errors: errors.length,
  });

  return uniqueDevices;
}

/**
 * Run a specific discovery tool
 * Enhanced from existing implementation with better error handling
 */
async function runDiscoveryTool(
  tool: 'subfinder' | 'amass' | 'assetfinder',
  domain: string,
  scope: ScanScope = 'EXTERNAL'
): Promise<DiscoveredDevice[]> {
  // Validate domain input (security)
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  if (!domainRegex.test(domain)) {
    throw new Error('Invalid domain format');
  }

  let stdout: string;

  try {
    switch (tool) {
      case 'subfinder':
        ({ stdout } = await execFileAsync(
          findTool('subfinder'),
          ['-d', domain, '-active', '-ip', '-oJ'],
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 } // 5 minute timeout
        ));
        return parseSubfinderOutput(stdout, domain, scope);

      case 'amass':
        ({ stdout } = await execFileAsync(
          findTool('amass'),
          ['enum', '-passive', '-d', domain],
          { maxBuffer: 10 * 1024 * 1024, timeout: 600000 } // 10 minute timeout for amass
        ));
        return parseAmassOutput(stdout, domain, scope);

      case 'assetfinder':
        ({ stdout } = await execFileAsync(
          findTool('assetfinder'),
          [domain],
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 } // 5 minute timeout
        ));
        return parseAssetfinderOutput(stdout, domain, scope);

      default:
        throw new Error(`Unknown discovery tool: ${tool}`);
    }
  } catch (error) {
    // Enhanced error context
    if (error instanceof Error) {
      throw new Error(`${tool} execution failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse subfinder JSON output
 * Enhanced from existing implementation with better error handling
 */
function parseSubfinderOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.host) {
        devices.push({
          scope,
          hostname: parsed.host,
          ipAddress: parsed.ip || undefined,
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: parsed.ip ? 1.0 : 0.8, // Higher confidence if IP is resolved
          metadata: {
            originalDomain,
            source: parsed.source,
          },
        });
      }
    } catch {
      // If not JSON, treat as plain text (fallback)
      if (line.includes('.') && line.includes(originalDomain)) {
        devices.push({
          scope,
          hostname: line.trim(),
          discoveredAt: new Date(),
          discoveryMethod: 'subfinder',
          confidence: 0.7, // Lower confidence for plain text parsing
          metadata: { originalDomain },
        });
      }
    }
  }

  return devices;
}

/**
 * Parse amass plain text output
 */
function parseAmassOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Amass output is typically just hostnames, one per line
    if (line.includes('.') && line.includes(originalDomain)) {
      devices.push({
        scope,
        hostname: line,
        discoveredAt: new Date(),
        discoveryMethod: 'amass',
        confidence: 0.9, // High confidence for amass results
        metadata: { originalDomain },
      });
    }
  }

  return devices;
}

/**
 * Parse assetfinder plain text output
 */
function parseAssetfinderOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Assetfinder output is typically just hostnames, one per line
    if (line.includes('.') && line.includes(originalDomain)) {
      devices.push({
        scope,
        hostname: line,
        discoveredAt: new Date(),
        discoveryMethod: 'assetfinder',
        confidence: 0.8, // Good confidence for assetfinder results
        metadata: { originalDomain },
      });
    }
  }

  return devices;
}

/**
 * Deduplicate devices by hostname+IP combination, keeping the one with highest confidence
 */
function deduplicateByHostname(
  devices: DiscoveredDevice[]
): DiscoveredDevice[] {
  const deviceMap = new Map<string, DiscoveredDevice>();

  for (const device of devices) {
    // Create unique key combining hostname and IP address
    const key = `${device.hostname}:${device.ipAddress || 'no-ip'}`;
    const existing = deviceMap.get(key);

    if (!existing || device.confidence > existing.confidence) {
      deviceMap.set(key, device);
    }
  }

  return Array.from(deviceMap.values());
}
