/**
 * Test Fixtures for Notification Scenarios
 *
 * Provides reusable scan result summaries for testing notification change detection.
 * Covers: new/closed ports, service changes, CVE additions, severity increases.
 *
 * Usage:
 * ```typescript
 * import { SCAN_FIXTURES } from './fixtures/notifications';
 *
 * const baseline = SCAN_FIXTURES.PORT_SCAN_SSH_ONLY;
 * const newScan = SCAN_FIXTURES.PORT_SCAN_SSH_RDP;
 * const changes = diffPorts(newScan, baseline, deviceId);
 * ```
 */

import type { EnrichedScanResultSummary } from '../../../types/cve-enrichment';

// ============================================================================
// Port Scan Fixtures
// ============================================================================

/**
 * Baseline: Single SSH port (22/tcp)
 */
export const PORT_SCAN_SSH_ONLY: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh' },
    },
  ],
  completedAt: new Date('2025-01-15T10:00:00Z').toISOString(),
};

/**
 * New scan: SSH + RDP (3389/tcp) added
 * Use case: Detect NEW_PORT notification
 */
export const PORT_SCAN_SSH_RDP: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 2,
  ports: [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh' },
    },
    {
      port: 3389,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ms-wbt-server', version: '10.0' },
    },
  ],
  completedAt: new Date('2025-01-15T11:00:00Z').toISOString(),
};

/**
 * Baseline: HTTP port (80/tcp) open
 */
export const PORT_SCAN_HTTP_OPEN: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'http' },
    },
  ],
  completedAt: new Date('2025-01-15T12:00:00Z').toISOString(),
};

/**
 * New scan: HTTP port (80/tcp) closed
 * Use case: Detect CLOSED_PORT notification
 */
export const PORT_SCAN_HTTP_CLOSED: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 0,
  ports: [
    {
      port: 80,
      protocol: 'tcp',
      state: 'closed',
      service: { name: 'http' },
    },
  ],
  completedAt: new Date('2025-01-15T13:00:00Z').toISOString(),
};

/**
 * Baseline: HTTPS port (443/tcp) with nginx 1.18.0
 */
export const PORT_SCAN_NGINX: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'https', product: 'nginx', version: '1.18.0' },
    },
  ],
  completedAt: new Date('2025-01-15T14:00:00Z').toISOString(),
};

/**
 * New scan: Same nginx port, version upgraded to 1.19.0
 * Use case: Detect service version change
 */
export const PORT_SCAN_NGINX_UPGRADED: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'https', product: 'nginx', version: '1.19.0' },
    },
  ],
  completedAt: new Date('2025-01-15T15:00:00Z').toISOString(),
};

// ============================================================================
// CVE Scan Fixtures
// ============================================================================

/**
 * Baseline: SSH port with no CVEs
 */
export const CVE_SCAN_NO_VULNS: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh' },
    },
  ],
  completedAt: new Date('2025-01-15T15:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T15:05:00Z').toISOString(),
    summary: {
      totalCves: 0,
      totalCritical: 0,
      totalHigh: 0,
      totalMedium: 0,
      totalLow: 0,
      affectedServices: 0,
      maxCvssScore: 0,
    },
  },
};

/**
 * New scan: SSH with CRITICAL CVE discovered
 * Use case: Detect NEW_CVE notification (CRITICAL severity)
 */
export const CVE_SCAN_CRITICAL_OPENSSH: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh', product: 'OpenSSH', version: '7.4' },
    },
  ],
  completedAt: new Date('2025-01-15T16:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T16:05:00Z').toISOString(),
    applications: [
      {
        name: 'OpenSSH',
        version: '7.4',
        port: 22,
        cveCount: 1,
        criticalCount: 1,
        highCount: 0,
        cves: [
          {
            cveId: 'CVE-2024-1234',
            severity: 'CRITICAL',
            cvssScore: 9.8,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'Remote code execution in OpenSSH 7.4',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 1,
      totalHigh: 0,
      totalMedium: 0,
      totalLow: 0,
      affectedServices: 1,
      maxCvssScore: 9.8,
    },
  },
};

/**
 * Baseline: nginx with MEDIUM severity CVE
 */
export const CVE_SCAN_MEDIUM_NGINX: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'https', product: 'nginx', version: '1.18.0' },
    },
  ],
  completedAt: new Date('2025-01-15T17:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T17:05:00Z').toISOString(),
    applications: [
      {
        name: 'nginx',
        version: '1.18.0',
        port: 443,
        cveCount: 1,
        criticalCount: 0,
        highCount: 0,
        cves: [
          {
            cveId: 'CVE-2024-5678',
            severity: 'MEDIUM',
            cvssScore: 5.3,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'Information disclosure in nginx',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 0,
      totalHigh: 0,
      totalMedium: 1,
      totalLow: 0,
      affectedServices: 1,
      maxCvssScore: 5.3,
    },
  },
};

/**
 * New scan: Same nginx CVE upgraded to CRITICAL
 * Use case: Detect CVE_SEVERITY_INCREASE notification (MEDIUM → CRITICAL)
 */
export const CVE_SCAN_CRITICAL_NGINX: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'https', product: 'nginx', version: '1.18.0' },
    },
  ],
  completedAt: new Date('2025-01-15T18:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T18:05:00Z').toISOString(),
    applications: [
      {
        name: 'nginx',
        version: '1.18.0',
        port: 443,
        cveCount: 1,
        criticalCount: 1,
        highCount: 0,
        cves: [
          {
            cveId: 'CVE-2024-5678',
            severity: 'CRITICAL',
            cvssScore: 9.1,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'Critical remote code execution in nginx (upgraded from information disclosure)',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 1,
      totalHigh: 0,
      totalMedium: 0,
      totalLow: 0,
      affectedServices: 1,
      maxCvssScore: 9.1,
    },
  },
};

/**
 * Scan with LOW severity CVE (should be suppressed by noise control)
 * Use case: Verify LOW/MEDIUM CVEs are not notified
 */
export const CVE_SCAN_LOW_APACHE: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'http', product: 'apache', version: '2.4.0' },
    },
  ],
  completedAt: new Date('2025-01-15T19:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T19:05:00Z').toISOString(),
    applications: [
      {
        name: 'apache',
        version: '2.4.0',
        port: 80,
        cveCount: 1,
        criticalCount: 0,
        highCount: 0,
        cves: [
          {
            cveId: 'CVE-2024-LOW',
            severity: 'LOW',
            cvssScore: 2.1,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'Low severity issue in Apache',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 0,
      totalHigh: 0,
      totalMedium: 0,
      totalLow: 1,
      affectedServices: 1,
      maxCvssScore: 2.1,
    },
  },
};

/**
 * Scan with HIGH severity CVE (should trigger notification)
 * Use case: Verify HIGH severity CVEs create notifications
 */
export const CVE_SCAN_HIGH_POSTGRES: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 1,
  ports: [
    {
      port: 5432,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'postgresql', product: 'PostgreSQL', version: '12.0' },
    },
  ],
  completedAt: new Date('2025-01-15T20:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T20:05:00Z').toISOString(),
    applications: [
      {
        name: 'PostgreSQL',
        version: '12.0',
        port: 5432,
        cveCount: 1,
        criticalCount: 0,
        highCount: 1,
        cves: [
          {
            cveId: 'CVE-2024-9999',
            severity: 'HIGH',
            cvssScore: 7.5,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'SQL injection vulnerability in PostgreSQL 12.0',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 0,
      totalHigh: 1,
      totalMedium: 0,
      totalLow: 0,
      affectedServices: 1,
      maxCvssScore: 7.5,
    },
  },
};

// ============================================================================
// Composite Scenarios
// ============================================================================

/**
 * Scan with multiple changes: new port + new CVE
 * Use case: Test multiple notifications generated from single scan
 */
export const SCAN_MULTIPLE_CHANGES: EnrichedScanResultSummary = {
  target: 'test-device',
  openPortCount: 2,
  ports: [
    {
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'ssh', product: 'OpenSSH', version: '8.0' },
    },
    {
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: { name: 'http', product: 'nginx', version: '1.20.0' },
    },
  ],
  completedAt: new Date('2025-01-15T21:00:00Z').toISOString(),
  cveEnrichment: {
    enrichedAt: new Date('2025-01-15T21:05:00Z').toISOString(),
    applications: [
      {
        name: 'nginx',
        version: '1.20.0',
        port: 80,
        cveCount: 1,
        criticalCount: 1,
        highCount: 0,
        cves: [
          {
            cveId: 'CVE-2024-MULTI',
            severity: 'CRITICAL',
            cvssScore: 9.0,
            publishedDate: '2025-01-15T00:00:00Z',
            description: 'Critical vulnerability in nginx 1.20.0',
          },
        ],
      },
    ],
    summary: {
      totalCves: 1,
      totalCritical: 1,
      totalHigh: 0,
      totalMedium: 0,
      totalLow: 0,
      affectedServices: 1,
      maxCvssScore: 9.0,
    },
  },
};

// ============================================================================
// Fixture Collections
// ============================================================================

/**
 * All port scan fixtures organized by scenario
 */
export const PORT_SCAN_FIXTURES = {
  SSH_ONLY: PORT_SCAN_SSH_ONLY,
  SSH_RDP: PORT_SCAN_SSH_RDP,
  HTTP_OPEN: PORT_SCAN_HTTP_OPEN,
  HTTP_CLOSED: PORT_SCAN_HTTP_CLOSED,
  NGINX: PORT_SCAN_NGINX,
  NGINX_UPGRADED: PORT_SCAN_NGINX_UPGRADED,
} as const;

/**
 * All CVE scan fixtures organized by scenario
 */
export const CVE_SCAN_FIXTURES = {
  NO_VULNS: CVE_SCAN_NO_VULNS,
  CRITICAL_OPENSSH: CVE_SCAN_CRITICAL_OPENSSH,
  MEDIUM_NGINX: CVE_SCAN_MEDIUM_NGINX,
  CRITICAL_NGINX: CVE_SCAN_CRITICAL_NGINX,
  LOW_APACHE: CVE_SCAN_LOW_APACHE,
  HIGH_POSTGRES: CVE_SCAN_HIGH_POSTGRES,
} as const;

/**
 * Common test scenarios with baseline + new scan pairs
 */
export const TEST_SCENARIOS = {
  NEW_PORT: {
    baseline: PORT_SCAN_SSH_ONLY,
    newScan: PORT_SCAN_SSH_RDP,
    expectedChange: 'NEW_PORT' as const,
    expectedPort: 3389,
  },
  CLOSED_PORT: {
    baseline: PORT_SCAN_HTTP_OPEN,
    newScan: PORT_SCAN_HTTP_CLOSED,
    expectedChange: 'CLOSED_PORT' as const,
    expectedPort: 80,
  },
  NEW_CVE_CRITICAL: {
    baseline: CVE_SCAN_NO_VULNS,
    newScan: CVE_SCAN_CRITICAL_OPENSSH,
    expectedChange: 'NEW_CVE' as const,
    expectedCVE: 'CVE-2024-1234',
  },
  CVE_SEVERITY_INCREASE: {
    baseline: CVE_SCAN_MEDIUM_NGINX,
    newScan: CVE_SCAN_CRITICAL_NGINX,
    expectedChange: 'CVE_SEVERITY_INCREASE' as const,
    expectedCVE: 'CVE-2024-5678',
    oldSeverity: 'MEDIUM' as const,
    newSeverity: 'CRITICAL' as const,
  },
  NO_CHANGES: {
    baseline: PORT_SCAN_SSH_ONLY,
    newScan: PORT_SCAN_SSH_ONLY,
    expectedChanges: [],
  },
  MULTIPLE_CHANGES: {
    baseline: PORT_SCAN_SSH_ONLY,
    newScan: SCAN_MULTIPLE_CHANGES,
    expectedChanges: ['NEW_PORT', 'NEW_CVE'] as const,
  },
} as const;
