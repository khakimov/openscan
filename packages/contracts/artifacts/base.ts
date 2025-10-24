/**
 * Base artifact schema shared across all scanner types
 */

import { z } from 'zod';

/**
 * Shared artifact envelope - keeps existing field names for compatibility
 */
export const BaseArtifactSchema = z.object({
  artifactType: z.string(),
  version: z.string(),

  // Keep existing scanContext key (don't rename to context)
  scanContext: z.object({
    target: z.string(),
    resolvedTarget: z.string().optional(),
    mode: z.enum(['DISCOVERY', 'EXTEND', 'UPTIME']).optional(),
    scanProfile: z.string().optional(), // 'PS_L1', 'PS_L2', etc.
    requestedPorts: z.array(z.number()).optional(),
    seedPorts: z.array(z.number()).optional(),
    historicPorts: z.array(z.number()).optional(),
    additionalPortRanges: z.array(z.string()).optional(),
    deviceId: z.string().optional(),
    isExtendScan: z.boolean(),
    isUptimeScan: z.boolean().optional(),
    authScanType: z.enum(['ANONYMOUS', 'AUTHENTICATED']),
    scanId: z.string(), // Restate workflow key
    scanRunId: z.string(),
    tenantId: z.string(),
    userId: z.string(),
  }),

  // Keep existing scanMetadata key
  scanMetadata: z.object({
    startTime: z.number(),
    endTime: z.number(),
    duration: z.number(),
    scanner: z.string(),
    version: z.string(),
    command: z.string(),
    retryCount: z.number().optional(),
    aggressivenessLevels: z.array(z.number()).optional(), // T5, T3, T1
    attempts: z.array(z.object({
      id: z.string(),
      args: z.string(),
    })).optional(),
  }),

  // Keep existing quality/processing keys
  quality: z.object({
    dataCompleteness: z.number().min(0).max(100),
    scanReliability: z.number().min(0).max(100),
    hasTimeouts: z.boolean(),
    hasRetries: z.boolean(),
    hasFilteredPorts: z.boolean().optional(), // Port-scan specific but harmless
    isRealTime: z.boolean(),
    cacheExpiry: z.number().optional(),
  }),

  processing: z.object({
    isProcessed: z.boolean(),
    processedAt: z.number().optional(),
    processedBy: z.array(z.string()).optional(),
    needsEnrichment: z.boolean(),
    enrichmentTasks: z.array(z.string()).optional(),
    followUps: z.array(z.any()).optional(), // Scanner-specific
    triggeredAlerts: z.array(z.string()).optional(),  // Alert IDs
    notificationsSent: z.array(z.string()).optional(), // Notification channels
  }),

  // Metadata with JSON-safe constraints
  metadata: z.record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ])
  ).optional(),
});

export type BaseArtifact = z.infer<typeof BaseArtifactSchema>;
