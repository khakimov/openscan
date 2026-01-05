/**
 * Service Evidence Resolver Types
 *
 * Defines the contracts for combining multiple service detection sources
 * (Nmap, HTTPx, TLS, etc.) into a single, auditable service determination.
 */
/**
 * Evidence source types
 */
export type ServiceEvidenceKind = 'nmap' | 'httpx' | 'tls' | 'zgrab' | 'manual' | 'unknown';
/**
 * Normalized evidence from any probe source
 *
 * All evidence sources must be normalized to this shape before resolution.
 * This allows the scoring algorithm to work generically.
 */
export interface ServiceEvidence {
    /** Source of this evidence */
    kind: ServiceEvidenceKind;
    /**
     * Confidence score (0-10)
     * How certain is this probe that it identified the service correctly?
     *
     * Examples:
     * - 10: HTTPx got 200 OK + valid HTML + screenshot
     * - 8:  Nmap high-confidence match (confidence ≥ 8)
     * - 5:  Nmap medium-confidence match (confidence 5-7)
     * - 3:  Nmap low-confidence match (confidence < 5)
     * - 0:  Probe failed or no data
     */
    confidence: number;
    /**
     * Quality score (0-10)
     * How rich/useful is the evidence, regardless of confidence?
     *
     * Examples:
     * - 10: Screenshot + full response body + headers
     * - 8:  Full response body + headers
     * - 5:  Headers only
     * - 3:  Status code only
     * - 1:  Connection succeeded but no data
     */
    quality: number;
    /**
     * Human-readable service name for UI display
     * Examples: "HTTP service", "SSH (OpenSSH 8.2)", "HTTPS", "MySQL 5.7"
     */
    displayName: string;
    /**
     * Structured metadata for this evidence
     * Format depends on evidence kind (see normalizers for schema)
     */
    metadata: Record<string, unknown>;
    /**
     * Original raw data from the probe
     * Preserved for debugging and audit trails
     */
    raw: unknown;
}
/**
 * Configuration for each evidence kind
 * Defines priority (which source wins ties) and quality thresholds
 */
export interface ServiceEvidenceWeight {
    /**
     * Priority level (higher wins)
     * Used for tie-breaking when confidence scores are equal
     *
     * Current priorities:
     * - 90: manual (user override always wins)
     * - 80: httpx (active HTTP probing very reliable)
     * - 60: tls (TLS fingerprint moderately reliable)
     * - 50: zgrab (banner grabs can be spoofed)
     * - 20: nmap (passive detection, prone to false positives)
     */
    priority: number;
    /**
     * Minimum confidence threshold to consider this evidence
     * Evidence below this threshold is discarded
     */
    confidenceThreshold: number;
    /**
     * Default confidence to assign if probe doesn't specify
     * Used when normalizer can't determine confidence programmatically
     */
    defaultConfidence: number;
}
/**
 * Resolved service determination with audit trail
 *
 * This is the final output of the resolution process, stored in the database
 * and rendered by the UI.
 */
export interface ResolvedService extends Omit<ServiceEvidence, 'raw'> {
    /**
     * Which evidence sources contributed to this resolution
     * Ordered by priority (first = chosen source, rest = supporting evidence)
     *
     * Example: ['httpx', 'nmap'] means HTTPx won, Nmap supported
     */
    resolvedFrom: ServiceEvidenceKind[];
    /**
     * Evidence sources that were suppressed/discarded
     * Helps analysts understand why certain detections were ignored
     *
     * Example: ['nmap:rwhois:confidence=3'] means Nmap detected "rwhois"
     * but was suppressed due to low confidence
     */
    suppressed?: string[];
    /**
     * When this resolution was made
     * ISO 8601 timestamp
     */
    resolvedAt: string;
}
/**
 * Complete service determination result
 * Contains both the resolved service and all contributing evidence
 */
export interface ServiceResolutionResult {
    /** Final resolved service (what UI should display) */
    resolved: ResolvedService | null;
    /** All evidence that was considered (for debugging/analytics) */
    allEvidence: ServiceEvidence[];
    /** Reason if resolution failed */
    failureReason?: 'no_evidence' | 'all_below_threshold' | 'conflicting_evidence';
}
/**
 * Fallback service when no evidence meets thresholds
 */
export interface UnknownService {
    kind: 'unknown';
    confidence: number;
    quality: number;
    displayName: string;
    metadata: {
        reason: string;
        attemptedProbes: ServiceEvidenceKind[];
    };
    resolvedFrom: ServiceEvidenceKind[];
    suppressed: string[];
    resolvedAt: string;
}
