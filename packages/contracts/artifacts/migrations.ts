/**
 * Artifact version migration system
 *
 * Wired into persistence NOW (as no-op) to prevent
 * "forgot to call it" bugs when we add real migrations
 */

import type { JsonObject } from './json-types';

export class ArtifactMigrations {
  /**
   * Apply version migrations to artifact
   * Currently a no-op but ready for future migrations
   */
  static apply(artifact: JsonObject): JsonObject {
    const artifactType = artifact.artifactType as string;
    const version = artifact.version as string;

    // Future migrations go here
    // Example:
    // if (artifactType === 'port_scan' && version === '1.0') {
    //   return this.migratePortScanV1ToV2(artifact);
    // }

    return artifact;
  }

  /**
   * Example migration stub (for testing)
   * TODO: Implement when we bump version to 2.0
   */
  private static migratePortScanV1ToV2(artifact: JsonObject): JsonObject {
    return {
      ...artifact,
      version: '2.0',
      // Add new fields, rename old ones, etc.
    };
  }
}
