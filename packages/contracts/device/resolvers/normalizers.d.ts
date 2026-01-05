/**
 * Service Evidence Normalizers
 *
 * Converts raw probe data into normalized ServiceEvidence format.
 * Each normalizer explicitly documents its confidence/quality scoring.
 */
import type { ServiceEvidence } from './types';
/**
 * Nmap service detection structure (from port snapshots)
 */
export interface NmapServiceDetection {
    name?: string;
    product?: string | null;
    version?: string | null;
    cpe?: string | null;
    method?: string;
    confidence?: number;
    tunnel?: string;
    osType?: string;
    deviceType?: string;
    extraInfo?: string;
    fingerprintMatches?: Array<{
        name: string;
        pattern: string;
        versionInfo?: string;
    }>;
}
/**
 * HTTPx probe structure (from database)
 */
export interface HttpxProbeData {
    id: string;
    scheme?: string | null;
    statusCode?: number | null;
    title?: string | null;
    screenshot?: string | null;
    responseTime?: number | null;
    webServer?: string | null;
    contentType?: string | null;
    contentLength?: number | null;
    bodyPreview?: string | null;
    failed?: boolean;
    failureReason?: string | null;
    [key: string]: unknown;
}
/**
 * Normalize Nmap service detection to evidence
 *
 * ## Confidence Scoring (0-10)
 *
 * Base score from Nmap's confidence field (0-10):
 * - Nmap confidence ≥ 8 → 8-10 (high confidence)
 * - Nmap confidence 5-7 → 5-7 (medium confidence)
 * - Nmap confidence < 5 → 0-4 (low confidence)
 * - No confidence field → 5 (default medium)
 *
 * Boosts:
 * - Top 20 common ports → +1 (80→HTTP more reliable than 31337→unknown)
 * - Has CPE identifier → +1 (CPE = authoritative product ID)
 * - Has version info → +0.5
 *
 * ## Quality Scoring (0-10)
 *
 * Richness of detection data:
 * - CPE + fingerprint + version → 10
 * - Version + method + product → 8
 * - Product + method → 6
 * - Method only → 4
 * - Name only → 2
 * - No data → 0
 *
 * @param detection - Nmap service detection object
 * @param port - Port number (for common port boost)
 * @returns Normalized evidence or null if no data
 */
export declare function normalizeNmap(detection: NmapServiceDetection | null | undefined, port: number): ServiceEvidence | null;
/**
 * Normalize HTTPx probe to evidence
 *
 * ## Confidence Scoring (0-10)
 *
 * HTTPx confidence is based on successful HTTP communication:
 * - 2xx/3xx + screenshot → 10 (perfect: visible proof)
 * - 2xx/3xx + body preview → 9 (excellent: full response)
 * - 2xx/3xx + headers only → 8 (good: valid response)
 * - 4xx + screenshot → 8 (good: auth/permission, but service confirmed)
 * - 4xx + body → 7 (decent: error page, but HTTP confirmed)
 * - 4xx/5xx + headers → 6 (moderate: server responded)
 * - Connection success, no status → 5 (weak: connected but unclear)
 * - Connection failed → 0 (no evidence)
 *
 * ## Quality Scoring (0-10)
 *
 * Richness of HTTP data collected:
 * - Screenshot + body + headers + tech → 10
 * - Screenshot + body + headers → 9
 * - Body + headers → 7
 * - Headers + server header → 5
 * - Status code only → 3
 * - Failed probe → 0
 *
 * @param probe - HTTPx probe data from database
 * @returns Normalized evidence or null if probe failed
 */
export declare function normalizeHttpx(probe: HttpxProbeData | null | undefined): ServiceEvidence | null;
/**
 * Normalize manual user override to evidence
 *
 * ## Confidence Scoring
 * Always 10 - user overrides are authoritative
 *
 * ## Quality Scoring
 * Based on how much information user provided:
 * - Name + version + notes → 10
 * - Name + version → 8
 * - Name only → 5
 *
 * @param override - Manual service override
 * @returns Normalized evidence
 */
export declare function normalizeManual(override: {
    name: string;
    version?: string;
    notes?: string;
    overriddenAt: string;
    overriddenBy: string;
}): ServiceEvidence;
