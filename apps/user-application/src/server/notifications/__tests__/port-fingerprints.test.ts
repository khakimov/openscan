import { describe, it, expect } from 'vitest';
import { diffPorts } from '../change-detector';
import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';

/**
 * Port Fingerprint Tests (sec-11n)
 *
 * Validates that NEW_PORT and CLOSED_PORT fingerprints include service metadata
 * (product, version, name) to prevent false deduplication when ports reopen with
 * different services.
 *
 * Legacy system hashed full message (including product/version) for deduplication.
 * Our fingerprints mirror that richness for consistent behavior.
 */

// Helper: Create minimal scan summary with portSnapshots
function createScanSummary(ports: Partial<PortSnapshot>[]): EnrichedScanResultSummary {
  return {
    target: '192.168.1.1',
    portSnapshots: ports.map((p) => ({
      port: p.port || 80,
      protocol: p.protocol || 'tcp',
      state: p.state || 'open',
      service: p.service || null,
      metadata: p.metadata || { lastSeenAt: new Date().toISOString() },
      enrichment: p.enrichment,
    })) as PortSnapshot[],
    completedAt: new Date().toISOString(),
  };
}

describe('Port Change Fingerprints (sec-11n)', () => {
  const deviceId = 'dev_test123';

  describe('NEW_PORT Fingerprints', () => {
    it('should include product+version+name in NEW_PORT fingerprint', () => {
      const previous = createScanSummary([]); // No ports initially

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_PORT');
      expect(changes[0].fingerprint).toContain('new_port');
      expect(changes[0].fingerprint).toContain(deviceId);
      expect(changes[0].fingerprint).toContain('tcp');
      expect(changes[0].fingerprint).toContain('80');
      expect(changes[0].fingerprint).toContain('nginx');
      expect(changes[0].fingerprint).toContain('1.18.0');
      expect(changes[0].fingerprint).toContain('http');
    });

    it('should generate different fingerprints for same port with different services', () => {
      const baseline = createScanSummary([]); // No ports

      const withNginx = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const withApache = createScanSummary([
        {
          port: 80,
          service: { product: 'apache', version: '2.4.0', name: 'http' },
        },
      ]);

      const changesNginx = diffPorts(withNginx, baseline, deviceId);
      const changesApache = diffPorts(withApache, baseline, deviceId);

      expect(changesNginx).toHaveLength(1);
      expect(changesApache).toHaveLength(1);

      // Fingerprints should differ (nginx vs apache)
      expect(changesNginx[0].fingerprint).not.toBe(changesApache[0].fingerprint);
      expect(changesNginx[0].fingerprint).toContain('nginx');
      expect(changesNginx[0].fingerprint).toContain('1.18.0');
      expect(changesApache[0].fingerprint).toContain('apache');
      expect(changesApache[0].fingerprint).toContain('2.4.0');
    });

    it('should generate different fingerprints for same service with different versions', () => {
      const baseline = createScanSummary([]);

      const v118 = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const v119 = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.19.0', name: 'http' },
        },
      ]);

      const changes118 = diffPorts(v118, baseline, deviceId);
      const changes119 = diffPorts(v119, baseline, deviceId);

      expect(changes118).toHaveLength(1);
      expect(changes119).toHaveLength(1);

      // Fingerprints should differ (version change)
      expect(changes118[0].fingerprint).not.toBe(changes119[0].fingerprint);
      expect(changes118[0].fingerprint).toContain('1.18.0');
      expect(changes119[0].fingerprint).toContain('1.19.0');
    });

    it('should use "unknown" in fingerprint when service metadata is missing', () => {
      const previous = createScanSummary([]);

      const current = createScanSummary([
        {
          port: 80,
          service: null, // No service detection
        },
      ]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('NEW_PORT');
      expect(changes[0].fingerprint).toContain('unknown');

      // Fingerprint should have three 'unknown' entries (product, version, name)
      const unknownCount = (changes[0].fingerprint.match(/unknown/g) || []).length;
      expect(unknownCount).toBe(3);
    });

    it('should distinguish unknown service from known service', () => {
      const baseline = createScanSummary([]);

      const withUnknown = createScanSummary([
        {
          port: 80,
          service: null,
        },
      ]);

      const withNginx = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changesUnknown = diffPorts(withUnknown, baseline, deviceId);
      const changesNginx = diffPorts(withNginx, baseline, deviceId);

      expect(changesUnknown).toHaveLength(1);
      expect(changesNginx).toHaveLength(1);

      // Fingerprints should differ (unknown vs nginx)
      expect(changesUnknown[0].fingerprint).not.toBe(changesNginx[0].fingerprint);
      expect(changesUnknown[0].fingerprint).toContain('unknown');
      expect(changesNginx[0].fingerprint).toContain('nginx');
    });
  });

  describe('CLOSED_PORT Fingerprints', () => {
    it('should include product+version+name in CLOSED_PORT fingerprint', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([]); // Port closed

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('CLOSED_PORT');
      expect(changes[0].fingerprint).toContain('closed_port');
      expect(changes[0].fingerprint).toContain(deviceId);
      expect(changes[0].fingerprint).toContain('tcp');
      expect(changes[0].fingerprint).toContain('80');
      expect(changes[0].fingerprint).toContain('nginx');
      expect(changes[0].fingerprint).toContain('1.18.0');
      expect(changes[0].fingerprint).toContain('http');
    });

    it('should generate different fingerprints for closing different services on same port', () => {
      const withNginx = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const withApache = createScanSummary([
        {
          port: 80,
          service: { product: 'apache', version: '2.4.0', name: 'http' },
        },
      ]);

      const noCurrent = createScanSummary([]); // Port closed

      const changesNginx = diffPorts(noCurrent, withNginx, deviceId);
      const changesApache = diffPorts(noCurrent, withApache, deviceId);

      expect(changesNginx).toHaveLength(1);
      expect(changesApache).toHaveLength(1);

      // Fingerprints should differ (closing nginx vs closing apache)
      expect(changesNginx[0].fingerprint).not.toBe(changesApache[0].fingerprint);
      expect(changesNginx[0].fingerprint).toContain('nginx');
      expect(changesApache[0].fingerprint).toContain('apache');
    });

    it('should use "unknown" in fingerprint when closed port had no service metadata', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: null, // No service detection
        },
      ]);

      const current = createScanSummary([]); // Port closed

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('CLOSED_PORT');
      expect(changes[0].fingerprint).toContain('unknown');

      // Fingerprint should have three 'unknown' entries (product, version, name)
      const unknownCount = (changes[0].fingerprint.match(/unknown/g) || []).length;
      expect(unknownCount).toBe(3);
    });
  });

  describe('Port Reopening Scenarios (sec-11n primary use case)', () => {
    it('should NOT deduplicate port reopening with different service', () => {
      const baseline = createScanSummary([]);

      // Day 1: Port 80 opens with nginx
      const day1 = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      // Day 2: Port 80 closes (simulated by removing from current scan)
      const day2 = createScanSummary([]);

      // Day 3: Port 80 reopens with apache
      const day3 = createScanSummary([
        {
          port: 80,
          service: { product: 'apache', version: '2.4.0', name: 'http' },
        },
      ]);

      const openNginx = diffPorts(day1, baseline, deviceId);
      const closeNginx = diffPorts(day2, day1, deviceId);
      const openApache = diffPorts(day3, day2, deviceId);

      expect(openNginx).toHaveLength(1);
      expect(closeNginx).toHaveLength(1);
      expect(openApache).toHaveLength(1);

      // Critical: NEW_PORT fingerprints should differ (nginx vs apache)
      expect(openNginx[0].fingerprint).not.toBe(openApache[0].fingerprint);
      expect(openNginx[0].fingerprint).toContain('nginx');
      expect(openApache[0].fingerprint).toContain('apache');

      // This prevents false deduplication:
      // Without service metadata in fingerprint, both would have same fingerprint
      // and openApache would be suppressed within the suppression window
    });

    it('should deduplicate port reopening with SAME service (expected behavior)', () => {
      const baseline = createScanSummary([]);

      // Port 80 opens with nginx 1.18.0
      const firstOpen = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      // Port 80 reopens with nginx 1.18.0 (same service)
      const secondOpen = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes1 = diffPorts(firstOpen, baseline, deviceId);
      const changes2 = diffPorts(secondOpen, baseline, deviceId);

      expect(changes1).toHaveLength(1);
      expect(changes2).toHaveLength(1);

      // Fingerprints should be IDENTICAL (same service)
      expect(changes1[0].fingerprint).toBe(changes2[0].fingerprint);

      // This means within suppression window, second notification would be deduped
      // which is CORRECT behavior (same port, same service)
    });
  });

  describe('Protocol Distinction', () => {
    it('should generate different fingerprints for TCP vs UDP on same port', () => {
      const baseline = createScanSummary([]);

      const tcp = createScanSummary([
        {
          port: 53,
          protocol: 'tcp',
          service: { product: 'bind', version: '9.18.0', name: 'domain' },
        },
      ]);

      const udp = createScanSummary([
        {
          port: 53,
          protocol: 'udp',
          service: { product: 'bind', version: '9.18.0', name: 'domain' },
        },
      ]);

      const changesTcp = diffPorts(tcp, baseline, deviceId);
      const changesUdp = diffPorts(udp, baseline, deviceId);

      expect(changesTcp).toHaveLength(1);
      expect(changesUdp).toHaveLength(1);

      // Fingerprints should differ (TCP vs UDP)
      expect(changesTcp[0].fingerprint).not.toBe(changesUdp[0].fingerprint);
      expect(changesTcp[0].fingerprint).toContain('tcp');
      expect(changesUdp[0].fingerprint).toContain('udp');
    });
  });
});
