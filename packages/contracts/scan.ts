/**
 * Scan domain types - shared across UI, workers, and data-ops
 * Single source of truth for scan representations
 */

import type { Result } from './result';

/**
 * Scan artifact from database (legacy structure)
 *
 * @remarks
 * Index signature allows unknown database fields. Handlers should narrow to
 * specific types at the edge rather than relying on `any`.
 *
 * Usage: `const extraField = artifact.someField as string | undefined;`
 */
export interface ScanArtifactRecord {
  id: string;
  scanRunId: string;
  type: string;
  filePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;  // ISO string after JSON serialization
  [key: string]: unknown;  // Database may include additional fields
}

/**
 * Make ScanRun very flexible to accommodate database objects
 *
 * @remarks
 * Index signature allows unknown database fields. Cast to specific types
 * when accessing non-standard fields:
 * `const summary = scanRun.resultSummary as ScanSummary | undefined;`
 */
export type ScanRun = {
  id: string;
  [key: string]: unknown;
};

/**
 * Get scans result type
 */
export type ScansListResult = Result<{
  data: ScanRun[];
}>;
