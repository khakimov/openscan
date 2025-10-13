/**
 * Artifact system barrel exports
 *
 * Discriminated union allows adding new scanners (ZAP, Nuclei, etc.)
 * without modifying core persistence logic
 */

import { z } from 'zod';
import { PortScanArtifactSchema } from './port-scan';
// Future: import { ZapScanArtifactSchema } from './zap-scan';
// Future: import { NucleiScanArtifactSchema } from './nuclei-scan';

/**
 * Discriminated union of all scanner artifacts
 * Add new scanner schemas here as they're implemented
 */
export const ScanArtifactSchema = z.discriminatedUnion('artifactType', [
  PortScanArtifactSchema,
  // ZapScanArtifactSchema,    // Add when ZAP integration ready
  // NucleiScanArtifactSchema,  // Add when Nuclei integration ready
]);

export type ScanArtifact = z.infer<typeof ScanArtifactSchema>;

// Export individual schemas for scanner-specific code
export * from './json-types';
export * from './base';
export * from './port-scan';
export * from './migrations';
