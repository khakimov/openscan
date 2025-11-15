import type { PortSnapshot } from '@repo/data-ops';

/**
 * PortDetail is the canonical port representation used throughout the UI.
 * It's based on the validated PortSnapshot schema with extensions for
 * UI-specific fields (httpxProbe, legacy timestamp fields, extended service).
 */
export type PortDetail = PortSnapshot & {
  service?: PortSnapshot["service"] & {
    reportedName?: string | null;
    extraInfo?: string | null;
    tunnel?: string | null;
    fingerprint?: string | null;
    fingerprintMatches?: Array<{
      probe: string;
      length?: number;
      response: string;
    }>;
  };
  // Legacy timestamp fields (UI still uses these)
  firstSeen?: number | null;
  lastSeen?: number | null;
  discoveredBy?: string[];
  // HTTPx probe data
  httpxProbe?: {
    scheme?: string;
    statusCode?: number;
    title?: string;
    screenshot?: string;
    responseTime?: number;
    webServer?: string;
    metadata?: any;
    technologies?: Array<{
      name: string;
      confidence?: string;
      version?: string;
    }>;
  };
};
