/**
 * Service Resolution Logic
 *
 * Combines multiple service evidence sources into a single, auditable determination.
 */

import type {
  ServiceEvidence,
  ServiceResolutionResult,
  ResolvedService,
  UnknownService,
} from './types';
import { SERVICE_EVIDENCE_WEIGHTS } from './weights';

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
export function resolveService(
  evidence: ServiceEvidence[]
): ServiceResolutionResult {
  const timestamp = new Date().toISOString();

  // Handle no evidence case
  if (evidence.length === 0) {
    return {
      resolved: null,
      allEvidence: [],
      failureReason: 'no_evidence',
    };
  }

  // Filter evidence by confidence thresholds
  const suppressed: string[] = [];
  const viable = evidence.filter((e) => {
    const weight = SERVICE_EVIDENCE_WEIGHTS[e.kind];
    if (!weight) {
      suppressed.push(`${e.kind}:unknown_kind`);
      return false;
    }

    if (e.confidence < weight.confidenceThreshold) {
      suppressed.push(
        `${e.kind}:${e.displayName}:confidence=${e.confidence}` +
        `:threshold=${weight.confidenceThreshold}`
      );
      return false;
    }

    return true;
  });

  // Handle all evidence below threshold
  if (viable.length === 0) {
    return {
      resolved: makeUnknownService(evidence, suppressed, timestamp),
      allEvidence: evidence,
      failureReason: 'all_below_threshold',
    };
  }

  // Sort by priority, then confidence, then quality
  const sorted = [...viable].sort((a, b) => {
    const weightA = SERVICE_EVIDENCE_WEIGHTS[a.kind];
    const weightB = SERVICE_EVIDENCE_WEIGHTS[b.kind];

    // Primary: Priority (higher wins)
    const priorityDiff = (weightB?.priority ?? 0) - (weightA?.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary: Confidence (higher wins)
    const confidenceDiff = b.confidence - a.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    // Tertiary: Quality (higher wins)
    return b.quality - a.quality;
  });

  // Winner is first in sorted list
  const winner = sorted[0];

  // Build resolved service with audit trail
  const resolved: ResolvedService = {
    kind: winner.kind,
    confidence: winner.confidence,
    quality: winner.quality,
    displayName: winner.displayName,
    metadata: winner.metadata,
    resolvedFrom: sorted.map((e) => e.kind),
    suppressed: suppressed.length > 0 ? suppressed : undefined,
    resolvedAt: timestamp,
  };

  return {
    resolved,
    allEvidence: evidence,
  };
}

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
export function makeUnknownService(
  evidence: ServiceEvidence[],
  suppressed: string[],
  timestamp: string
): UnknownService {
  const attemptedProbes = [...new Set(evidence.map((e) => e.kind))];

  let reason = 'No service detection available';
  if (suppressed.length > 0) {
    reason = `All detection attempts below confidence threshold (${suppressed.length} suppressed)`;
  } else if (evidence.length === 0) {
    reason = 'No service detection probes executed';
  }

  return {
    kind: 'unknown',
    confidence: 0,
    quality: 0,
    displayName: 'Unknown service',
    metadata: {
      reason,
      attemptedProbes,
    },
    resolvedFrom: [],
    suppressed,
    resolvedAt: timestamp,
  };
}

/**
 * Get summary statistics from resolution result
 *
 * Useful for analytics and debugging
 */
export function getResolutionStats(result: ServiceResolutionResult) {
  return {
    totalEvidence: result.allEvidence.length,
    evidenceKinds: [...new Set(result.allEvidence.map((e) => e.kind))],
    suppressedCount: result.resolved?.suppressed?.length ?? 0,
    winningKind: result.resolved?.kind ?? null,
    winningConfidence: result.resolved?.confidence ?? 0,
    winningQuality: result.resolved?.quality ?? 0,
    avgConfidence:
      result.allEvidence.length > 0
        ? result.allEvidence.reduce((sum, e) => sum + e.confidence, 0) /
          result.allEvidence.length
        : 0,
    failureReason: result.failureReason,
  };
}
