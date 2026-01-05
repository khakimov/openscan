/**
 * Service Evidence Weights Configuration
 *
 * This is the single source of truth for service resolution policy.
 * Modify these weights to change how different evidence sources are prioritized.
 *
 * ## How Resolution Works
 *
 * 1. Evidence is normalized from raw probe data (see normalizers.ts)
 * 2. Evidence below confidenceThreshold is discarded
 * 3. Remaining evidence is sorted by:
 *    a. Priority (higher wins)
 *    b. Confidence (higher wins if priority tied)
 *    c. Quality (higher wins if confidence tied)
 * 4. Top evidence becomes the resolved service
 * 5. All evidence is preserved for audit trail
 *
 * ## Confidence Score Mapping
 *
 * Each evidence kind maps raw probe data to 0-10 confidence:
 *
 * ### Nmap (-sV service detection)
 * - Raw confidence 0-10 from Nmap → Direct mapping
 * - No confidence field → Use defaultConfidence (5)
 * - Top 20 common ports → Boost by +1
 *
 * ### HTTPx (HTTP probing)
 * - Status 2xx/3xx + screenshot → 10
 * - Status 2xx/3xx + body → 9
 * - Status 2xx/3xx → 8
 * - Status 4xx/5xx + screenshot → 8
 * - Status 4xx/5xx → 7
 * - Connection success, no status → 5
 * - Connection failed → 0
 *
 * ### TLS (future)
 * - Valid cert chain + SNI match → 10
 * - Valid cert chain → 9
 * - Self-signed cert → 7
 * - TLS handshake only → 5
 * - Handshake failed → 0
 *
 * ### ZGrab (future)
 * - Banner matches known signature → 8
 * - Banner partial match → 6
 * - Banner received but no match → 4
 * - No banner → 0
 *
 * ### Manual
 * - User override → 10 (always wins)
 *
 * ## Quality Score Mapping
 *
 * Quality measures richness of evidence, independent of confidence:
 *
 * ### HTTPx
 * - Screenshot + body + headers → 10
 * - Body + headers → 8
 * - Headers only → 5
 * - Status code only → 3
 *
 * ### Nmap
 * - CPE + fingerprint + version → 10
 * - Version + method → 8
 * - Method only → 5
 * - Name only → 3
 *
 * ### TLS
 * - Cert chain + cipher + protocol → 10
 * - Cert chain → 7
 * - Protocol only → 4
 */
import type { ServiceEvidenceKind, ServiceEvidenceWeight } from './types';
export declare const SERVICE_EVIDENCE_WEIGHTS: Partial<Record<ServiceEvidenceKind, ServiceEvidenceWeight>>;
/**
 * Top 20 most common ports (for boosting Nmap confidence)
 * Source: Nmap's nmap-services database + IANA assignments
 */
export declare const TOP_20_COMMON_PORTS: Set<number>;
/**
 * Helper to check if port is in top 20
 */
export declare function isCommonPort(port: number): boolean;
