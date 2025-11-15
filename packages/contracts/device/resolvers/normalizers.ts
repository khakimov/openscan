/**
 * Service Evidence Normalizers
 *
 * Converts raw probe data into normalized ServiceEvidence format.
 * Each normalizer explicitly documents its confidence/quality scoring.
 */

import type { ServiceEvidence } from './types';
import { isCommonPort } from './weights';

/**
 * Nmap service detection structure (from port snapshots)
 */
export interface NmapServiceDetection {
  name?: string;
  product?: string | null;
  version?: string | null;
  cpe?: string | null;
  method?: string;
  confidence?: number; // 0-10 from Nmap
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
  scheme?: string | null; // 'http' or 'https'
  statusCode?: number | null;
  title?: string | null;
  screenshot?: string | null; // R2 key
  responseTime?: number | null;
  webServer?: string | null;
  contentType?: string | null;
  contentLength?: number | null;
  bodyPreview?: string | null;
  failed?: boolean;
  failureReason?: string | null;
  [key: string]: unknown; // Allow additional fields
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
export function normalizeNmap(
  detection: NmapServiceDetection | null | undefined,
  port: number
): ServiceEvidence | null {
  if (!detection || !detection.name) {
    return null;
  }

  // Base confidence from Nmap
  let confidence = detection.confidence ?? 5;

  // Apply boosts
  if (isCommonPort(port)) {
    confidence = Math.min(10, confidence + 1);
  }
  if (detection.cpe) {
    confidence = Math.min(10, confidence + 1);
  }
  if (detection.version) {
    confidence = Math.min(10, confidence + 0.5);
  }

  // Calculate quality from data richness
  let quality = 0;
  if (detection.cpe) quality += 4;
  if (detection.fingerprintMatches?.length) quality += 3;
  if (detection.version) quality += 2;
  if (detection.product) quality += 1;
  if (detection.method) quality += 1;
  quality = Math.min(10, quality);

  // Build display name
  const parts: string[] = [];
  if (detection.product) {
    parts.push(detection.product);
  } else if (detection.name) {
    parts.push(detection.name);
  }
  if (detection.version) {
    parts.push(detection.version);
  }
  const displayName = parts.length > 0 ? parts.join(' ') : detection.name;

  return {
    kind: 'nmap',
    confidence: Math.round(confidence * 10) / 10, // Round to 1 decimal
    quality,
    displayName,
    metadata: {
      name: detection.name,
      product: detection.product,
      version: detection.version,
      cpe: detection.cpe,
      method: detection.method,
      tunnel: detection.tunnel,
      osType: detection.osType,
      deviceType: detection.deviceType,
      extraInfo: detection.extraInfo,
      fingerprintMatches: detection.fingerprintMatches,
      rawConfidence: detection.confidence,
      port,
      isCommonPort: isCommonPort(port),
    },
    raw: detection,
  };
}

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
export function normalizeHttpx(
  probe: HttpxProbeData | null | undefined
): ServiceEvidence | null {
  if (!probe || probe.failed) {
    return null;
  }

  const statusCode = probe.statusCode ?? 0;
  const hasScreenshot = Boolean(probe.screenshot);
  const hasBody = Boolean(probe.bodyPreview);
  const hasContentType = Boolean(probe.contentType);
  const hasServer = Boolean(probe.webServer);

  // Calculate confidence based on response quality
  let confidence = 0;
  if (statusCode >= 200 && statusCode < 400) {
    // Success responses
    if (hasScreenshot) confidence = 10;
    else if (hasBody) confidence = 9;
    else confidence = 8;
  } else if (statusCode >= 400 && statusCode < 500) {
    // Client errors (auth, not found, etc.) - still confirms HTTP service
    if (hasScreenshot) confidence = 8;
    else if (hasBody) confidence = 7;
    else confidence = 6;
  } else if (statusCode >= 500) {
    // Server errors - confirms HTTP but less reliable
    confidence = 6;
  } else if (statusCode > 0) {
    // Other status codes
    confidence = 5;
  } else {
    // No status code but probe succeeded
    confidence = 5;
  }

  // Calculate quality from data richness
  let quality = 0;
  if (hasScreenshot) quality += 4;
  if (hasBody) quality += 3;
  if (hasContentType) quality += 1;
  if (hasServer) quality += 1;
  if (probe.responseTime !== null && probe.responseTime !== undefined) quality += 1;
  quality = Math.min(10, quality);

  // Build display name
  const scheme = probe.scheme === 'https' ? 'HTTPS' : 'HTTP';
  const statusText = statusCode > 0 ? ` (${statusCode})` : '';
  const serverText = probe.webServer ? ` - ${probe.webServer}` : '';
  const displayName = `${scheme} service${statusText}${serverText}`;

  return {
    kind: 'httpx',
    confidence,
    quality,
    displayName,
    metadata: {
      scheme: probe.scheme,
      statusCode: probe.statusCode,
      title: probe.title,
      screenshot: probe.screenshot,
      responseTime: probe.responseTime,
      webServer: probe.webServer,
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      hasBody,
      hasScreenshot,
    },
    raw: probe,
  };
}

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
export function normalizeManual(override: {
  name: string;
  version?: string;
  notes?: string;
  overriddenAt: string;
  overriddenBy: string;
}): ServiceEvidence {
  let quality = 5; // Base for name only
  if (override.version) quality += 3;
  if (override.notes) quality += 2;

  const displayName = override.version
    ? `${override.name} ${override.version}`
    : override.name;

  return {
    kind: 'manual',
    confidence: 10,
    quality,
    displayName,
    metadata: {
      name: override.name,
      version: override.version,
      notes: override.notes,
      overriddenAt: override.overriddenAt,
      overriddenBy: override.overriddenBy,
    },
    raw: override,
  };
}
