import { describe, it, expect } from 'vitest';
import { diffServiceDrift } from '../change-detector';
import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';

/**
 * Service Drift Detection Tests (sec-8sh)
 *
 * Tests the service drift detection logic that mirrors legacy Daemon.compare_parameters behavior.
 * Validates that we detect product changes, version changes, and name changes on existing ports.
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

describe('diffServiceDrift', () => {
  const deviceId = 'dev_test123';

  describe('Product Changes (MEDIUM severity)', () => {
    it('should detect product change from nginx to apache', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'apache', version: '2.4.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('SERVICE_DRIFT');
      expect(changes[0].severity).toBe('MEDIUM'); // Product change = suspicious
      expect(changes[0].title).toContain('nginx');
      expect(changes[0].title).toContain('apache');
      expect(changes[0].fingerprint).toContain('apache');
      expect(changes[0].fingerprint).toContain('2.4.0');
    });

    it('should handle product change from known to unknown', () => {
      const previous = createScanSummary([
        {
          port: 22,
          service: { product: 'OpenSSH', version: '9.6p1', name: 'ssh' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 22,
          service: { product: null, version: null, name: 'ssh' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].severity).toBe('MEDIUM');
      expect(changes[0].title).toContain('OpenSSH');
      expect(changes[0].title).toContain('unknown');
    });
  });

  describe('Version Changes (INFO severity)', () => {
    it('should detect version upgrade (nginx 1.18.0 → 1.19.0)', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.19.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('SERVICE_DRIFT');
      expect(changes[0].severity).toBe('INFO'); // Version only = informational
      expect(changes[0].title).toContain('1.18.0');
      expect(changes[0].title).toContain('1.19.0');
      expect(changes[0].fingerprint).toContain('nginx');
      expect(changes[0].fingerprint).toContain('1.19.0');
    });

    it('should detect version downgrade', () => {
      const previous = createScanSummary([
        {
          port: 3306,
          service: { product: 'MySQL', version: '8.0.35', name: 'mysql' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 3306,
          service: { product: 'MySQL', version: '5.7.42', name: 'mysql' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].severity).toBe('INFO');
      expect(changes[0].title).toContain('8.0.35');
      expect(changes[0].title).toContain('5.7.42');
    });
  });

  describe('Service Name Changes', () => {
    it('should detect service name change', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'https' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('SERVICE_DRIFT');
      expect(changes[0].severity).toBe('INFO');
      expect(changes[0].title).toContain('http');
      expect(changes[0].title).toContain('https');
    });
  });

  describe('No Drift Cases', () => {
    it('should not emit notification when service unchanged', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(0);
    });

    it('should not emit notification for first scan (no baseline)', () => {
      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, null, deviceId);

      expect(changes).toHaveLength(0);
    });

    it('should ignore closed ports', () => {
      const previous = createScanSummary([
        {
          port: 80,
          state: 'open',
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          state: 'closed',
          service: { product: 'apache', version: '2.4.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(0); // Port is now closed, not drift
    });

    it('should ignore new ports (handled by NEW_PORT notification)', () => {
      const previous = createScanSummary([]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(0); // New port, not drift
    });
  });

  describe('Edge Cases', () => {
    it('should handle service becoming null (detection lost)', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: null,
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].severity).toBe('MEDIUM'); // Service disappeared = suspicious
    });

    it('should handle multiple ports with drift', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
        {
          port: 443,
          service: { product: 'nginx', version: '1.18.0', name: 'https' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.19.0', name: 'http' },
        },
        {
          port: 443,
          service: { product: 'apache', version: '2.4.0', name: 'https' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(2);
      expect(changes[0].severity).toBe('INFO'); // Port 80 version change
      expect(changes[1].severity).toBe('MEDIUM'); // Port 443 product change
    });

    it('should handle TCP vs UDP protocol distinction', () => {
      const previous = createScanSummary([
        {
          port: 53,
          protocol: 'tcp',
          service: { product: 'bind', version: '9.18.0', name: 'domain' },
        },
        {
          port: 53,
          protocol: 'udp',
          service: { product: 'bind', version: '9.18.0', name: 'domain' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 53,
          protocol: 'tcp',
          service: { product: 'bind', version: '9.19.0', name: 'domain' },
        },
        {
          port: 53,
          protocol: 'udp',
          service: { product: 'bind', version: '9.18.0', name: 'domain' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      expect(changes).toHaveLength(1); // Only TCP port changed
      expect(changes[0].fingerprint).toContain('tcp');
    });
  });

  describe('Fingerprint (sec-11n compliance)', () => {
    it('should include product+version+name in fingerprint for dedupe', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const current = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.19.0', name: 'http' },
        },
      ]);

      const changes = diffServiceDrift(current, previous, deviceId);

      const fingerprint = changes[0].fingerprint;
      expect(fingerprint).toContain('service_drift');
      expect(fingerprint).toContain(deviceId);
      expect(fingerprint).toContain('tcp');
      expect(fingerprint).toContain('80');
      expect(fingerprint).toContain('nginx');
      expect(fingerprint).toContain('1.19.0');
      expect(fingerprint).toContain('http');
    });

    it('should generate different fingerprints for version increments', () => {
      const previous = createScanSummary([
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

      const v120 = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.20.0', name: 'http' },
        },
      ]);

      const changes1 = diffServiceDrift(v119, previous, deviceId);
      const changes2 = diffServiceDrift(v120, v119, deviceId);

      expect(changes1[0].fingerprint).not.toBe(changes2[0].fingerprint);
      expect(changes1[0].fingerprint).toContain('1.19.0');
      expect(changes2[0].fingerprint).toContain('1.20.0');
    });

    it('should generate different fingerprints for name-only changes', () => {
      const previous = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const https = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'https' },
        },
      ]);

      const backToHttp = createScanSummary([
        {
          port: 80,
          service: { product: 'nginx', version: '1.18.0', name: 'http' },
        },
      ]);

      const changes1 = diffServiceDrift(https, previous, deviceId);
      const changes2 = diffServiceDrift(backToHttp, https, deviceId);

      // Both should emit notifications (not deduped)
      expect(changes1).toHaveLength(1);
      expect(changes2).toHaveLength(1);

      // Fingerprints should differ
      expect(changes1[0].fingerprint).not.toBe(changes2[0].fingerprint);
      expect(changes1[0].fingerprint).toContain(':https');
      expect(changes2[0].fingerprint).toContain(':http');
    });
  });
});
