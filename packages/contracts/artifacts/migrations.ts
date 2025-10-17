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
   * Currently a no-op - add migrations when needed
   */
  static apply(artifact: JsonObject): JsonObject {
    // TODO: Add migrations here when schemas evolve
    return artifact;
  }
}
