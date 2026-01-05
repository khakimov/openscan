/**
 * Service Resolution Logic
 *
 * Combines multiple service evidence sources into a single, auditable determination.
 */
import type { ServiceEvidence, ServiceResolutionResult, UnknownService } from './types';
/**
 * Pick the best service evidence from multiple sources
 *
 * Algorithm:
 * 1. Filter out evidence below confidence thresholds
 * 2. Sort by: priority (desc) → confidence (desc) → quality (desc)
 * 3. Return top evidence with audit trail
 *
 * @param evidence - Array of normalized evidence from different sources
 * @returns Resolution result with chosen service and audit trail
 */
export declare function resolveService(evidence: ServiceEvidence[]): ServiceResolutionResult;
/**
 * Create an unknown service fallback with audit trail
 *
 * Used when:
 * - No evidence provided
 * - All evidence below thresholds
 * - Evidence is conflicting/invalid
 *
 * @param evidence - All evidence that was considered
 * @param suppressed - Evidence that was rejected
 * @param timestamp - Resolution timestamp
 * @returns Unknown service with diagnostic info
 */
export declare function makeUnknownService(evidence: ServiceEvidence[], suppressed: string[], timestamp: string): UnknownService;
/**
 * Get summary statistics from resolution result
 *
 * Useful for analytics and debugging
 */
export declare function getResolutionStats(result: ServiceResolutionResult): {
    totalEvidence: number;
    evidenceKinds: import("./types").ServiceEvidenceKind[];
    suppressedCount: number;
    winningKind: import("./types").ServiceEvidenceKind | null;
    winningConfidence: number;
    winningQuality: number;
    avgConfidence: number;
    failureReason: "no_evidence" | "all_below_threshold" | "conflicting_evidence" | undefined;
};
