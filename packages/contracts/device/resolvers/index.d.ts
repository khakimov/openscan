/**
 * Service Evidence Resolver
 *
 * Provides a declarative, testable system for combining multiple service
 * detection sources (Nmap, HTTPx, TLS, etc.) into a single determination.
 *
 * ## Usage Example
 *
 * ```typescript
 * import {
 *   normalizeNmap,
 *   normalizeHttpx,
 *   resolveService,
 * } from '@repo/contracts/device/resolvers';
 *
 * // Collect evidence from different sources
 * const evidence = [
 *   normalizeNmap(port.service, port.port),
 *   normalizeHttpx(httpxProbesMap.get(port.port)),
 * ].filter(Boolean);
 *
 * // Resolve to single service
 * const { resolved, allEvidence } = resolveService(evidence);
 *
 * // Use resolved service in UI
 * snapshot.service = resolved;
 * snapshot.evidence = allEvidence; // For debugging/analytics
 * ```
 *
 * ## Adding New Probe Types
 *
 * 1. Add kind to `ServiceEvidenceKind` in types.ts
 * 2. Add weight config to `SERVICE_EVIDENCE_WEIGHTS` in weights.ts
 * 3. Create normalizer function in normalizers.ts (document confidence/quality!)
 * 4. Export normalizer from this file
 * 5. Add test cases in __tests__/resolution.test.ts
 */
export type { ServiceEvidenceKind, ServiceEvidence, ServiceEvidenceWeight, ResolvedService, ServiceResolutionResult, UnknownService, } from './types';
export { SERVICE_EVIDENCE_WEIGHTS, TOP_20_COMMON_PORTS, isCommonPort, } from './weights';
export type { NmapServiceDetection, HttpxProbeData, } from './normalizers';
export { normalizeNmap, normalizeHttpx, normalizeManual, } from './normalizers';
export { resolveService, makeUnknownService, getResolutionStats, } from './service-resolution';
