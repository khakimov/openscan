/**
 * Discovery Tools Implementation (sec-28)
 *
 * Secure execution of discovery tools and parsing of their outputs.
 * Ported from Temporal worker with security patterns preserved.
 *
 * Security features:
 * - Uses execFile (not exec) to prevent shell injection
 * - Validates domain input before execution
 * - Arguments passed as array (no shell interpolation)
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Types
export type ScanScope = "EXTERNAL" | "INTERNAL";
export type DiscoveryTool = "subfinder" | "amass" | "assetfinder";

export interface DiscoveredDevice {
  scope: ScanScope;
  hostname: string;
  ipAddress?: string;
  discoveredAt: Date;
  discoveryMethod: DiscoveryTool | "direct";
  confidence: number; // 0.0-1.0
  metadata: {
    originalDomain: string;
    source?: string;
  };
}

/**
 * Helper to find tool in PATH or common Go locations
 */
function findTool(toolName: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const paths = [
    toolName, // Try PATH first
    `${homeDir}/go/bin/${toolName}`,
    `/usr/local/bin/${toolName}`,
    `/usr/bin/${toolName}`,
  ];
  return paths[0]; // Let execFile resolve from PATH
}

/**
 * Run a specific discovery tool
 *
 * Security: Uses execFile with array arguments (no shell interpolation)
 */
export async function runDiscoveryTool(
  tool: DiscoveryTool,
  domain: string,
  scope: ScanScope = "EXTERNAL",
): Promise<DiscoveredDevice[]> {
  // Validate domain input (CRITICAL SECURITY)
  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  if (!domainRegex.test(domain)) {
    throw new Error(`Invalid domain format: "${domain}"`);
  }

  let stdout: string;

  try {
    switch (tool) {
      case "subfinder":
        ({ stdout } = await execFileAsync(
          findTool("subfinder"),
          ["-d", domain, "-active", "-ip", "-oJ"],
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 }, // 5 minute timeout
        ));
        return parseSubfinderOutput(stdout, domain, scope);

      // case 'amass':
      //   ({ stdout } = await execFileAsync(
      //     findTool('amass'),
      //     ['enum', '-passive', '-d', domain],
      //     { maxBuffer: 10 * 1024 * 1024, timeout: 600000 } // 10 minute timeout for amass
      //   ));
      //   return parseAmassOutput(stdout, domain, scope);

      // case 'assetfinder':
      //   ({ stdout } = await execFileAsync(
      //     findTool('assetfinder'),
      //     [domain],
      //     { maxBuffer: 10 * 1024 * 1024, timeout: 300000 } // 5 minute timeout
      //   ));
      //   return parseAssetfinderOutput(stdout, domain, scope);

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
 *
 * Format: JSON lines with {host, ip, source}
 * Example: {"host":"api.example.com","ip":"1.2.3.4","source":"crtsh"}
 */
export function parseSubfinderOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope,
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.host) {
        devices.push({
          scope,
          hostname: parsed.host,
          ipAddress: parsed.ip || undefined,
          discoveredAt: new Date(),
          discoveryMethod: "subfinder",
          confidence: parsed.ip ? 1.0 : 0.8, // Higher confidence if IP is resolved
          metadata: {
            originalDomain,
            source: parsed.source,
          },
        });
      }
    } catch {
      // If not JSON, treat as plain text (fallback)
      if (line.includes(".") && line.includes(originalDomain)) {
        devices.push({
          scope,
          hostname: line.trim(),
          discoveredAt: new Date(),
          discoveryMethod: "subfinder",
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
 *
 * Format: One hostname per line
 * Example:
 * api.example.com
 * www.example.com
 */
export function parseAmassOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope,
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Amass output is typically just hostnames, one per line
    if (line.includes(".") && line.includes(originalDomain)) {
      devices.push({
        scope,
        hostname: line,
        discoveredAt: new Date(),
        discoveryMethod: "amass",
        confidence: 0.9, // High confidence for amass results
        metadata: { originalDomain },
      });
    }
  }

  return devices;
}

/**
 * Parse assetfinder plain text output
 *
 * Format: One hostname per line
 * Example:
 * api.example.com
 * www.example.com
 */
export function parseAssetfinderOutput(
  output: string,
  originalDomain: string,
  scope: ScanScope,
): DiscoveredDevice[] {
  const devices: DiscoveredDevice[] = [];
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    // Assetfinder output is typically just hostnames, one per line
    if (line.includes(".") && line.includes(originalDomain)) {
      devices.push({
        scope,
        hostname: line,
        discoveredAt: new Date(),
        discoveryMethod: "assetfinder",
        confidence: 0.8, // Good confidence for assetfinder results
        metadata: { originalDomain },
      });
    }
  }

  return devices;
}

/**
 * Deduplicate devices by hostname+IP combination, keeping the one with highest confidence
 *
 * Key format: "hostname:IP" or "hostname:no-ip"
 * Logic: If same key exists, keep the one with higher confidence
 */
export function deduplicateByHostname(
  devices: DiscoveredDevice[],
): DiscoveredDevice[] {
  const deviceMap = new Map<string, DiscoveredDevice>();

  for (const device of devices) {
    // Create unique key combining hostname and IP address
    const key = `${device.hostname}:${device.ipAddress || "no-ip"}`;
    const existing = deviceMap.get(key);

    if (!existing || device.confidence > existing.confidence) {
      deviceMap.set(key, device);
    }
  }

  return Array.from(deviceMap.values());
}
