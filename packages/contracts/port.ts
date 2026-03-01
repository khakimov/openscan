/**
 * Port scan types - shared across UI, workers, and data-ops
 *
 * These are plain TypeScript types that match the Zod schemas
 * in data-ops/src/types/cve-enrichment.ts. The Zod schemas
 * remain in data-ops for runtime validation.
 */

/**
 * Per-port enrichment summary (lightweight CVE counts for UI list views)
 */
export interface PortEnrichmentSummary {
  summary: {
    cveCount: number;
    criticalCount: number;
    highCount: number;
    maxCvssScore?: number;
  };
  topCves?: Array<{
    cveId: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    cvssScore: number;
  }>;
}

/**
 * Unified port snapshot with service metadata, timestamps, and enrichment
 *
 * Each snapshot is a complete, diff-friendly unit keyed by {protocol}/{port}.
 *
 * Timestamps:
 * - lastSeenAt: Set by handler (current scan completion time)
 * - firstSeenAt: Set by change detector (when port first discovered in baseline)
 * - lastChangedAt: Set by change detector (when service/product/version last drifted)
 */
export interface PortSnapshot {
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service: {
    name?: string;
    product?: string | null;
    version?: string | null;
    cpe?: string | null;
    method?: string;
    confidence?: number;
  } | null;
  metadata: {
    lastSeenAt: string;
    firstSeenAt?: string;
    lastChangedAt?: string;
  };
  enrichment?: PortEnrichmentSummary;
}

/**
 * Port scan statistics (pre-filtering metrics)
 *
 * Captured at scan time before filtering, since they depend
 * on data we don't persist (e.g., serviceDetectionRate needs
 * the count before filtering out ports without service info).
 */
export interface PortScanStats {
  /** Total open ports discovered (before filtering) */
  totalOpenPorts: number;
  /** Ports with service information detected */
  portsWithService: number;
  /** Ports stored in portSnapshots (after filtering & capping) */
  portsStored: number;
  /** Service detection rate (portsWithService / totalOpenPorts * 100) */
  serviceDetectionRate: number;
  /** Suspicious pattern detected (e.g., WAF/proxy) */
  suspiciousAllPortsOpen?: boolean;
  /** Scan pattern description (e.g., "Possible WAF/Proxy") */
  scanPattern?: string;
}
