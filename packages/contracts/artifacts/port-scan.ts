/**
 * Port scan artifact schema with complete field coverage
 *
 * Replaces apps/worker/src/workflows/portscan/types/port-scan-artifact.ts
 * All existing consumers should import from here instead
 */

import { z } from 'zod';
import { BaseArtifactSchema } from './base';
import type { JsonValue } from './json-types';

export const PortScanArtifactSchema = BaseArtifactSchema.extend({
  artifactType: z.literal('port_scan'),
  version: z.literal('1.0'),

  // Complete ports array (including tunnel, serviceRaw)
  ports: z.array(z.object({
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(['tcp', 'udp']),
    state: z.enum(['open', 'closed', 'filtered']),
    service: z.object({
      name: z.string().optional(),
      product: z.string().optional(),
      version: z.string().optional(),
      extraInfo: z.string().optional(),
      method: z.string().optional(),
      confidence: z.number().optional(),
      tunnel: z.string().optional(),           // SSL tunnel
      cpe: z.array(z.string()).optional(),
      fingerprint: z.string().optional(),      // Nmap service fingerprint
      fingerprintMatches: z.array(z.object({
        probe: z.string(),
        length: z.number().optional(),
        response: z.string(),
      })).optional(),
      serviceRaw: z.string().optional(),       // Raw service string from logs
    }).optional(),
    discoveredBy: z.array(z.string()),
    firstSeen: z.number(),
    lastSeen: z.number(),
  })),

  osInfo: z.object({
    matches: z.array(z.object({
      name: z.string(),
      accuracy: z.number().min(0).max(100),
      vendor: z.string().optional(),
      family: z.string().optional(),
      generation: z.string().optional(),
      type: z.string().optional(),
      osClass: z.object({
        type: z.string().optional(),
        vendor: z.string().optional(),
        osfamily: z.string().optional(),
        osgen: z.string().optional(),
        accuracy: z.number().optional(),
      }).optional(),
    })),
    fingerprints: z.array(z.any()).optional(),
    confidence: z.number().optional(),
  }).optional(),

  statistics: z.object({
    totalPorts: z.number(),
    openPorts: z.number(),
    closedPorts: z.number(),
    filteredPorts: z.number(),
    tcpPorts: z.number(),
    udpPorts: z.number(),
    servicesIdentified: z.number(),
    servicesWithVersion: z.number(),
    portsPerSecond: z.number().optional(),
    averageResponseTime: z.number().optional(),
  }),

  deviceInfo: z.object({
    deviceId: z.string().optional(),
    ipAddress: z.string(),
    hostnames: z.array(z.string()),
    isNewDevice: z.boolean(),
    lastScannedAt: z.number().optional(),
    scope: z.enum(['INTERNAL', 'EXTERNAL', 'UNKNOWN']).optional(),
    networkSegment: z.string().optional(),
  }).optional(),

  errors: z.array(z.object({
    type: z.enum(['timeout', 'permission', 'network', 'parsing']),
    message: z.string(),
    timestamp: z.number(),
    context: z.record(z.string(), z.unknown()).optional(),
  })).optional(),

  runStats: z.object({
    finished: z.object({
      time: z.number(),
      timeStr: z.string(),
      summary: z.string(),
      elapsed: z.number(),
      exit: z.string(),
    }),
    hosts: z.object({
      up: z.number(),
      down: z.number(),
      total: z.number(),
    }),
  }).optional(),
});

export type PortScanArtifact = z.infer<typeof PortScanArtifactSchema>;

/**
 * Type guard: Ensures artifact is JSON-safe at compile time
 * Zod validates runtime, but this helps TypeScript understand the guarantee
 */
export function assertJsonSafe(_artifact: PortScanArtifact): asserts _artifact is PortScanArtifact & { [K in keyof PortScanArtifact]: JsonValue } {
  // Zod already validated, this is just for TypeScript
}

/**
 * Simplified port scan result for backward compatibility
 * Maps to the existing PortScanResult interface
 */
export interface LegacyPortScanResult {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service?: string;
  version?: string;
}

/**
 * Follow-up task interface (from existing code)
 */
export interface PortScanFollowUpTask {
  type: 'web-scan';
  target: string;
  resolvedTarget?: string;
  port: number;
  protocol: 'tcp' | 'udp';
  scheme: 'http' | 'https' | 'unknown';
  serviceName?: string;
  reasons: string[];
}

/**
 * Utility functions replacing PortScanArtifactHelper
 * For backward compatibility with existing scripts/tests
 */
export class PortScanArtifactUtils {
  /**
   * Get summary statistics from artifact
   */
  static getSummary(artifact: PortScanArtifact) {
    return {
      target: artifact.scanContext.target,
      totalPorts: artifact.statistics.totalPorts,
      openPorts: artifact.statistics.openPorts,
      scanDuration: artifact.scanMetadata.duration,
      osDetected: artifact.osInfo?.matches.length || 0,
      servicesFound: artifact.statistics.servicesIdentified,
      isNewDevice: artifact.deviceInfo?.isNewDevice || false,
    };
  }

  /**
   * Check if artifact needs processing
   */
  static needsProcessing(artifact: PortScanArtifact): boolean {
    return !artifact.processing.isProcessed;
  }

  /**
   * Mark artifact as processed (mutates in place)
   */
  static markProcessed(artifact: PortScanArtifact, processor: string): void {
    artifact.processing.isProcessed = true;
    artifact.processing.processedAt = Date.now() / 1000;
    artifact.processing.processedBy = [
      ...(artifact.processing.processedBy || []),
      processor,
    ];
  }

  /**
   * Convert to legacy format
   */
  static toLegacyFormat(artifact: PortScanArtifact): LegacyPortScanResult[] {
    return artifact.ports.map(port => ({
      port: port.port,
      protocol: port.protocol,
      state: port.state,
      service: port.service?.name,
      version: port.service?.version,
    }));
  }
}
