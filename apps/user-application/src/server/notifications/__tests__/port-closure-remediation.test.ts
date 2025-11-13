import { describe, it, expect } from 'vitest';
import { diffPorts } from '../change-detector';
import type { EnrichedScanResultSummary, PortSnapshot } from '@repo/data-ops';

/**
 * Port Closure Remediation Tests (sec-acw)
 *
 * Tests that CLOSED_PORT notifications include port-specific remediation guidance.
 * Improvement over legacy system which only emitted generic "app down" alerts.
 *
 * Legacy: "Application %s on host %s on port %s is offline" (priority 70/INFO)
 * Modern: Port-specific context to help distinguish expected hardening from unexpected outages
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

describe('Port Closure Remediation Context (sec-acw)', () => {
  const deviceId = 'dev_test123';

  describe('High-Risk Port Closures (Security Hardening)', () => {
    it('should provide positive context for Telnet (23) closure', () => {
      const previous = createScanSummary([
        {
          port: 23,
          service: { product: 'telnetd', version: '1.0', name: 'telnet' },
        },
      ]);

      const current = createScanSummary([]); // Port closed

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('CLOSED_PORT');
      expect(changes[0].severity).toBe('INFO');
      expect(changes[0].message).toContain('Good security practice');
      expect(changes[0].message).toContain('Telnet is insecure');
      expect(changes[0].message).toContain('SSH');
    });

    it('should provide context for SMB (445) closure reducing ransomware risk', () => {
      const previous = createScanSummary([
        {
          port: 445,
          service: { product: 'smbd', version: '4.0', name: 'microsoft-ds' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('ransomware');
      expect(changes[0].message).toContain('secure alternatives');
    });

    it('should provide context for NetBIOS (139) closure improving security', () => {
      const previous = createScanSummary([
        {
          port: 139,
          service: { product: 'netbios', version: null, name: 'netbios-ssn' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('security posture');
      expect(changes[0].message).toContain('legacy SMB');
    });
  });

  describe('Critical Service Port Closures (Potential Outage)', () => {
    it('should provide verification guidance for SSH (22) closure', () => {
      const previous = createScanSummary([
        {
          port: 22,
          service: { product: 'OpenSSH', version: '9.6p1', name: 'ssh' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('Verify');
      expect(changes[0].message).toContain('intentional');
      expect(changes[0].message).toContain('service status');
    });

    it('should provide verification guidance for RDP (3389) closure', () => {
      const previous = createScanSummary([
        {
          port: 3389,
          service: { product: 'Microsoft Terminal Services', version: '10.0', name: 'ms-wbt-server' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('remote access');
      expect(changes[0].message).toContain('VPN');
      expect(changes[0].message).toContain('SSH');
    });

    it('should provide verification guidance for MySQL (3306) closure', () => {
      const previous = createScanSummary([
        {
          port: 3306,
          service: { product: 'MySQL', version: '8.0.35', name: 'mysql' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('database availability');
      expect(changes[0].message).toContain('MySQL');
    });

    it('should provide verification guidance for PostgreSQL (5432) closure', () => {
      const previous = createScanSummary([
        {
          port: 5432,
          service: { product: 'PostgreSQL', version: '15.3', name: 'postgresql' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('database availability');
      expect(changes[0].message).toContain('PostgreSQL');
    });

    it('should provide verification guidance for Redis (6379) closure', () => {
      const previous = createScanSummary([
        {
          port: 6379,
          service: { product: 'Redis', version: '7.0.0', name: 'redis' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('Redis');
      expect(changes[0].message).toContain('cache');
    });
  });

  describe('Unmapped Port Closures (Generic Guidance)', () => {
    it('should provide generic guidance for unmapped ports', () => {
      const previous = createScanSummary([
        {
          port: 8080,
          service: { product: 'custom-app', version: '1.0', name: 'http-alt' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('CLOSED_PORT');
      expect(changes[0].severity).toBe('INFO');
      expect(changes[0].message).toContain('Port 8080 closure detected');
      expect(changes[0].message).toContain('intentional');
      expect(changes[0].message).toContain('alternative means');
    });

    it('should handle closure with unknown service gracefully', () => {
      const previous = createScanSummary([
        {
          port: 9000,
          service: null, // No service detection
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes).toHaveLength(1);
      expect(changes[0].message).toContain('Port 9000 closure detected');
      expect(changes[0].message).toContain('Verify this was intentional');
    });
  });

  describe('Severity Consistency (Legacy Alignment)', () => {
    it('should maintain INFO severity for all closures (matches legacy priority 70)', () => {
      const ports = [22, 23, 445, 3389, 3306, 5432, 8080];

      for (const port of ports) {
        const previous = createScanSummary([
          {
            port,
            service: { product: 'test-service', version: '1.0', name: 'test' },
          },
        ]);

        const current = createScanSummary([]);
        const changes = diffPorts(current, previous, deviceId);

        expect(changes).toHaveLength(1);
        expect(changes[0].severity).toBe('INFO');
      }
    });
  });

  describe('Message Structure', () => {
    it('should include service name in title', () => {
      const previous = createScanSummary([
        {
          port: 22,
          service: { product: 'OpenSSH', version: '9.6p1', name: 'ssh' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes[0].title).toContain('ssh');
      expect(changes[0].title).toContain('port 22');
      expect(changes[0].title).toContain('closed');
    });

    it('should use "service" as fallback when service name is unknown', () => {
      const previous = createScanSummary([
        {
          port: 8080,
          service: null,
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      expect(changes[0].title).toContain('service');
      expect(changes[0].title).toContain('port 8080');
    });
  });

  describe('Comparison with Legacy Behavior', () => {
    it('should improve on legacy generic message', () => {
      // Legacy: "Application telnetd on host 192.168.1.1 on port 23 is offline"
      // Modern: Includes remediation context

      const previous = createScanSummary([
        {
          port: 23,
          service: { product: 'telnetd', version: '1.0', name: 'telnet' },
        },
      ]);

      const current = createScanSummary([]);

      const changes = diffPorts(current, previous, deviceId);

      // Legacy would only say "is offline"
      // We add remediation: "Good security practice - Telnet is insecure..."
      expect(changes).toHaveLength(1);
      const change = changes[0]!;
      const message = change.message ?? '';
      expect(message).not.toBe('Port 23/tcp (telnet) is no longer accessible');
      expect(message.length).toBeGreaterThan(50); // Has substantial guidance
    });
  });
});
