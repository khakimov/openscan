/**
 * Type definitions for scan server functions
 */

export interface ScanArtifact {
  id: string;
  scanRunId: string;
  type: string;
  filePath: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;  // ISO string after JSON serialization
  // NOTE: Database may include additional fields. Index signature uses `any` for TanStack compatibility,
  // but handlers should treat unknown fields as type `unknown` for safety.
  [key: string]: any;
}

// Make ScanRun very flexible to accommodate database objects
// NOTE: Index signature uses `any` for TanStack compatibility,
// but handlers should treat unknown fields as type `unknown` for safety.
export type ScanRun = {
  id: string;
  [key: string]: any;
};

// Get scans result types
export interface ScansListSuccess {
  success: true;
  data: ScanRun[];
  error?: undefined;
}

export interface ScansListError {
  success: false;
  data: never[];
  error: string;
}

export type ScansListResult =
  | ScansListSuccess
  | ScansListError;
