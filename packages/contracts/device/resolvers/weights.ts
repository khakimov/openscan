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

export const SERVICE_EVIDENCE_WEIGHTS: Record<ServiceEvidenceKind, ServiceEvidenceWeight> = {
  /**
   * User manual override
   * Always takes precedence over automated detection
   */
  manual: {
    priority: 90,
    confidenceThreshold: 0, // Accept any manual entry
    defaultConfidence: 10,
  },

  /**
   * HTTPx active HTTP probing
   * Very reliable - we actually connected and got HTTP response
   * High priority because it's active confirmation, not passive detection
   */
  httpx: {
    priority: 80,
    confidenceThreshold: 7, // Require at least 4xx response or better
    defaultConfidence: 8,
  },

  /**
   * TLS/SSL fingerprinting (not yet implemented)
   * Moderately reliable - certificate data is hard to fake
   * Lower than HTTPx because TLS can be tunneled/proxied
   */
  tls: {
    priority: 60,
    confidenceThreshold: 5, // Require at least handshake success
    defaultConfidence: 7,
  },

  /**
   * ZGrab banner grabbing (not yet implemented)
   * Less reliable - banners can be spoofed or customized
   * Useful for SSH, FTP, SMTP where banners are standard
   */
  zgrab: {
    priority: 50,
    confidenceThreshold: 6, // Require decent banner match
    defaultConfidence: 6,
  },

  /**
   * Nmap service detection (-sV)
   * Least reliable - passive fingerprinting prone to false positives
   * Still useful as fallback when no active probes available
   */
  nmap: {
    priority: 20,
    confidenceThreshold: 5, // Require medium confidence (Nmap's threshold)
    defaultConfidence: 5,
  },
};

/**
 * Top 20 most common ports (for boosting Nmap confidence)
 * Source: Nmap's nmap-services database + IANA assignments
 */
export const TOP_20_COMMON_PORTS = new Set([
  21,   // FTP
  22,   // SSH
  23,   // Telnet
  25,   // SMTP
  53,   // DNS
  80,   // HTTP
  110,  // POP3
  143,  // IMAP
  443,  // HTTPS
  445,  // SMB
  3306, // MySQL
  3389, // RDP
  5432, // PostgreSQL
  5900, // VNC
  6379, // Redis
  8080, // HTTP-alt
  8443, // HTTPS-alt
  9200, // Elasticsearch
  27017, // MongoDB
  5000, // Various (Docker, Flask, etc.)
]);

/**
 * Helper to check if port is in top 20
 */
export function isCommonPort(port: number): boolean {
  return TOP_20_COMMON_PORTS.has(port);
}
