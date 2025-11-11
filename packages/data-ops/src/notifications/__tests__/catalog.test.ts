import { describe, it, expect } from 'vitest';
import {
  createNewPortNotification,
  createClosedPortNotification,
  createNewCVENotification,
  createCVESeverityIncreaseNotification,
  mapCVESeverityToNotificationSeverity,
  getSeverityOrder,
  PORT_SEVERITY_MAP,
  PORT_SECURITY_MESSAGES,
} from '../catalog';

/**
 * Unit tests for notification catalog (sec-e4s)
 *
 * Validates that catalog builder functions produce correct:
 * - notification types
 * - severity levels
 * - modules
 * - titles
 * - messages
 *
 * Ensures consistency across all notification types and proper
 * integration with the module taxonomy system (sec-xp0).
 */

describe('Notification Catalog - Port Discovery', () => {
  describe('createNewPortNotification', () => {
    it('should create notification for high-risk port (SSH)', () => {
      const notification = createNewPortNotification({
        port: 22,
        protocol: 'tcp',
        service: 'ssh',
      });

      expect(notification).toEqual({
        type: 'NEW_PORT',
        severity: 'MEDIUM',
        module: 'NETWORK_SECURITY',
        title: 'New ssh on port 22 discovered',
        message: 'SSH service detected. Ensure strong authentication and disable root login.',
      });
    });

    it('should create notification for critical port (Telnet)', () => {
      const notification = createNewPortNotification({
        port: 23,
        protocol: 'tcp',
        service: 'telnet',
      });

      expect(notification).toEqual({
        type: 'NEW_PORT',
        severity: 'HIGH',
        module: 'NETWORK_SECURITY',
        title: 'New telnet on port 23 discovered',
        message: 'Telnet service detected. CRITICAL: Unencrypted protocol, migrate to SSH immediately.',
      });
    });

    it('should create notification for RDP (high severity)', () => {
      const notification = createNewPortNotification({
        port: 3389,
        protocol: 'tcp',
        service: 'ms-wbt-server',
      });

      expect(notification).toEqual({
        type: 'NEW_PORT',
        severity: 'HIGH',
        module: 'NETWORK_SECURITY',
        title: 'New ms-wbt-server on port 3389 discovered',
        message: 'RDP service exposed. High risk - consider VPN-only access and enable NLA.',
      });
    });

    it('should accept version parameter but not currently use it', () => {
      const withVersion = createNewPortNotification({
        port: 22,
        protocol: 'tcp',
        service: 'ssh',
        version: 'OpenSSH 8.9',
      });

      const withoutVersion = createNewPortNotification({
        port: 22,
        protocol: 'tcp',
        service: 'ssh',
      });

      // Regression guard: Version is accepted but currently NOT rendered
      // If this assertion fails, it means version is now being included
      // (which would be a feature enhancement, not a bug)
      expect(withVersion.title).toBe(withoutVersion.title);
      expect(withVersion.message).toBe(withoutVersion.message);

      // Current behavior: Version parameter is silently ignored
      expect(withVersion.title).not.toContain('8.9');
      expect(withVersion.title).not.toContain('OpenSSH');
    });

    it('should not leak version parameter in output (explicit regression guard)', () => {
      const notification = createNewPortNotification({
        port: 22,
        protocol: 'tcp',
        version: 'OpenSSH 8.9',
      });

      // Explicit: Version must NOT appear in user-visible output today
      // When we add version rendering, this test MUST be updated consciously
      expect(notification.title).not.toContain('OpenSSH');
      expect(notification.title).not.toContain('8.9');
      expect(notification.message).not.toContain('OpenSSH');
      expect(notification.message).not.toContain('8.9');

      // Ensure we're testing the actual output, not just empty strings
      expect(notification.title.length).toBeGreaterThan(0);
      expect(notification.message!.length).toBeGreaterThan(0);
    });

    it('should handle unknown ports with default severity', () => {
      const notification = createNewPortNotification({
        port: 9999,
        protocol: 'tcp',
        service: 'unknown',
      });

      expect(notification).toEqual({
        type: 'NEW_PORT',
        severity: 'LOW',
        module: 'NETWORK_SECURITY',
        title: 'New unknown on port 9999 discovered',
        message: 'New service detected on port 9999. Review security configuration.',
      });
    });

    it('should handle missing service name gracefully', () => {
      const notification = createNewPortNotification({
        port: 8080,
        protocol: 'tcp',
      });

      expect(notification).toEqual({
        type: 'NEW_PORT',
        severity: 'LOW',
        module: 'NETWORK_SECURITY',
        title: 'New service on port 8080 discovered',
        message: 'New service detected on port 8080. Review security configuration.',
      });
    });

    it('should use correct module for all port notifications', () => {
      const ports = [22, 23, 3389, 445, 9999];

      for (const port of ports) {
        const notification = createNewPortNotification({
          port,
          protocol: 'tcp',
        });

        expect(notification.module).toBe('NETWORK_SECURITY');
      }
    });
  });

  describe('createClosedPortNotification', () => {
    it('should create notification for closed SSH port', () => {
      const notification = createClosedPortNotification({
        port: 22,
        protocol: 'tcp',
        service: 'ssh',
      });

      expect(notification).toEqual({
        type: 'CLOSED_PORT',
        severity: 'INFO',
        module: 'NETWORK_SECURITY',
        title: 'ssh on port 22 is now closed',
        message: 'Verify SSH closure was intentional. Check service status and logs if unexpected.',
      });
    });

    it('should always use INFO severity for port closures', () => {
      const ports = [22, 23, 3389, 445, 9999];

      for (const port of ports) {
        const notification = createClosedPortNotification({
          port,
          protocol: 'tcp',
          service: 'test',
        });

        expect(notification.severity).toBe('INFO');
      }
    });

    it('should handle missing service name gracefully', () => {
      const notification = createClosedPortNotification({
        port: 8080,
        protocol: 'tcp',
      });

      expect(notification).toEqual({
        type: 'CLOSED_PORT',
        severity: 'INFO',
        module: 'NETWORK_SECURITY',
        title: 'service on port 8080 is now closed',
        message: 'Port 8080 closure detected. Verify this was intentional and service is accessible via alternative means if needed.',
      });
    });
  });

  describe('PORT_SEVERITY_MAP', () => {
    it('should contain entries for all high-risk ports', () => {
      const expectedPorts = [22, 23, 3389, 445, 139, 1433, 3306, 5432, 6379, 27017, 5900];

      for (const port of expectedPorts) {
        expect(PORT_SEVERITY_MAP[port]).toBeDefined();
      }
    });

    it('should map critical ports to HIGH severity', () => {
      const criticalPorts = [23, 3389, 445, 139, 5900];

      for (const port of criticalPorts) {
        expect(PORT_SEVERITY_MAP[port]).toBe('HIGH');
      }
    });

    it('should map common database ports to MEDIUM severity', () => {
      const dbPorts = [1433, 3306, 5432, 6379, 27017];

      for (const port of dbPorts) {
        expect(PORT_SEVERITY_MAP[port]).toBe('MEDIUM');
      }
    });
  });

  describe('PORT_SECURITY_MESSAGES', () => {
    it('should contain security guidance for all mapped ports', () => {
      const mappedPorts = Object.keys(PORT_SEVERITY_MAP).map(Number);

      for (const port of mappedPorts) {
        expect(PORT_SECURITY_MESSAGES[port]).toBeDefined();
        expect(PORT_SECURITY_MESSAGES[port].length).toBeGreaterThan(0);
      }
    });

    it('should include actionable guidance in messages', () => {
      // All messages should contain actionable words
      const actionableKeywords = ['ensure', 'disable', 'patch', 'restrict', 'enable', 'use', 'migrate', 'consider', 'review'];

      Object.values(PORT_SECURITY_MESSAGES).forEach(message => {
        const hasActionableGuidance = actionableKeywords.some(keyword =>
          message.toLowerCase().includes(keyword)
        );
        expect(hasActionableGuidance).toBe(true);
      });
    });
  });
});

describe('Notification Catalog - CVE Notifications', () => {
  describe('createNewCVENotification', () => {
    it('should create notification for critical CVE', () => {
      const notification = createNewCVENotification({
        cveId: 'CVE-2024-1234',
        severity: 'CRITICAL',
        cvssScore: 9.8,
        description: 'Remote code execution vulnerability',
        affectedService: 'nginx/1.18.0',
      });

      expect(notification.type).toBe('NEW_CVE');
      expect(notification.severity).toBe('CRITICAL');
      expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      expect(notification.title).toBe('New CRITICAL vulnerability CVE-2024-1234 discovered affecting nginx/1.18.0');
      expect(notification.message).toContain('CVE-2024-1234 (CVSS 9.8): Remote code execution vulnerability');
      expect(notification.message).toContain('Remediation:');
    });

    it('should create notification without affected service', () => {
      const notification = createNewCVENotification({
        cveId: 'CVE-2024-5678',
        severity: 'HIGH',
        cvssScore: 7.5,
        description: 'Information disclosure vulnerability',
      });

      expect(notification.type).toBe('NEW_CVE');
      expect(notification.severity).toBe('HIGH');
      expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      expect(notification.title).toBe('New HIGH vulnerability CVE-2024-5678 discovered');
      expect(notification.message).toContain('CVE-2024-5678 (CVSS 7.5): Information disclosure vulnerability');
      expect(notification.message).toContain('Remediation:');
    });

    it('should handle missing description gracefully', () => {
      const notification = createNewCVENotification({
        cveId: 'CVE-2024-9999',
        severity: 'MEDIUM',
        cvssScore: 5.3,
      });

      expect(notification.message).toContain('No description available');
    });

    it('should map CVE severity to notification severity correctly', () => {
      const severityMappings = [
        { cveSeverity: 'CRITICAL', expected: 'CRITICAL' },
        { cveSeverity: 'HIGH', expected: 'HIGH' },
        { cveSeverity: 'MEDIUM', expected: 'MEDIUM' },
        { cveSeverity: 'LOW', expected: 'LOW' },
      ];

      for (const { cveSeverity, expected } of severityMappings) {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity: cveSeverity,
          cvssScore: 5.0,
        });

        expect(notification.severity).toBe(expected);
      }
    });

    it('should use VULNERABILITY_MANAGEMENT module for all CVE notifications', () => {
      const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

      for (const severity of severities) {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity,
          cvssScore: 5.0,
        });

        expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      }
    });
  });

  describe('createCVESeverityIncreaseNotification', () => {
    it('should create notification for severity upgrade', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-1234',
        oldSeverity: 'MEDIUM',
        newSeverity: 'CRITICAL',
        cvssScore: 9.1,
        description: 'Active exploitation detected in the wild',
        affectedService: 'apache/2.4.41',
      });

      expect(notification.type).toBe('CVE_SEVERITY_INCREASE');
      expect(notification.severity).toBe('CRITICAL');
      expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      expect(notification.title).toBe('CVE-2024-1234 severity upgraded to CRITICAL affecting apache/2.4.41');
      expect(notification.message).toContain('Vulnerability CVE-2024-1234 severity increased from MEDIUM to CRITICAL (CVSS 9.1): Active exploitation detected in the wild');
      expect(notification.message).toContain('Remediation:');
    });

    it('should create notification without affected service', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-5678',
        oldSeverity: 'LOW',
        newSeverity: 'HIGH',
        cvssScore: 7.8,
      });

      expect(notification.type).toBe('CVE_SEVERITY_INCREASE');
      expect(notification.severity).toBe('HIGH');
      expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      expect(notification.title).toBe('CVE-2024-5678 severity upgraded to HIGH');
      expect(notification.message).toContain('Vulnerability CVE-2024-5678 severity increased from LOW to HIGH (CVSS 7.8): No description available');
      expect(notification.message).toContain('Remediation:');
    });

    it('should include both old and new severity in message', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-TEST',
        oldSeverity: 'MEDIUM',
        newSeverity: 'HIGH',
        cvssScore: 7.5,
      });

      expect(notification.message).toContain('MEDIUM');
      expect(notification.message).toContain('HIGH');
    });

    it('should use new severity for notification severity', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-TEST',
        oldSeverity: 'LOW',
        newSeverity: 'CRITICAL',
        cvssScore: 9.5,
      });

      expect(notification.severity).toBe('CRITICAL');
    });

    it('should handle lowercase/mixed-case severity input correctly', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-CASE-TEST',
        oldSeverity: 'medium',
        newSeverity: 'critical',
        cvssScore: 9.2,
        description: 'Severity escalated due to active exploitation',
      });

      // Notification severity should be normalized to uppercase
      expect(notification.severity).toBe('CRITICAL');

      // Title should use uppercase severity from input (passed through as-is)
      expect(notification.title).toContain('critical');

      // Message should preserve original casing from input
      expect(notification.message).toContain('medium');
      expect(notification.message).toContain('critical');
      expect(notification.message).toContain('Remediation:');

      // Verify core fields (message now includes remediation, so not using toEqual)
      expect(notification.type).toBe('CVE_SEVERITY_INCREASE');
      expect(notification.module).toBe('VULNERABILITY_MANAGEMENT');
      expect(notification.title).toBe('CVE-2024-CASE-TEST severity upgraded to critical');
    });
  });

  describe('CVE Remediation Guidance (sec-5j6)', () => {
    describe('Severity-based remediation', () => {
      it('should append CRITICAL remediation for critical CVEs', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-1234',
          severity: 'CRITICAL',
          cvssScore: 9.8,
          description: 'Remote code execution in foo.',
          affectedService: 'foo',
        });

        expect(notification.message).toContain('Remediation: Apply vendor fixes immediately');
        expect(notification.message).toContain('isolate exposed services');
        expect(notification.message).toContain('assess for compromise');
      });

      it('should append HIGH remediation for high severity CVEs', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-5678',
          severity: 'HIGH',
          cvssScore: 8.6,
          description: 'Privilege escalation vulnerability.',
        });

        expect(notification.message).toContain('Remediation: Schedule the vendor patch');
        expect(notification.message).toContain('as soon as possible');
        expect(notification.message).toContain('monitor for exploitation');
      });

      it('should append MEDIUM remediation for medium severity CVEs', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-9012',
          severity: 'MEDIUM',
          cvssScore: 5.3,
          description: 'Information disclosure vulnerability.',
        });

        expect(notification.message).toContain('Remediation: Plan a maintenance window');
        expect(notification.message).toContain('Track completion');
      });

      it('should append LOW remediation for low severity CVEs', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-3456',
          severity: 'LOW',
          cvssScore: 3.1,
          description: 'Minor security issue.',
        });

        expect(notification.message).toContain('Remediation: Review during the next scheduled update');
        expect(notification.message).toContain('apply fixes where practical');
      });

      it('should use generic fallback for unknown severities', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-UNKNOWN',
          severity: 'UNKNOWN',
          cvssScore: 0.0,
          description: 'Unknown severity.',
        });

        expect(notification.message).toContain('Remediation: Review vendor guidance');
        expect(notification.message).toContain('apply the recommended fix');
      });
    });

    describe('Service-specific remediation', () => {
      it('should use SSH-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-5678',
          severity: 'HIGH',
          cvssScore: 8.6,
          description: 'Privilege escalation in ssh.',
          affectedService: 'SSH',
        });

        expect(notification.message).toContain('Upgrade the SSH daemon');
        expect(notification.message).toContain('rotate credentials if compromise is suspected');
        // Should also include severity-based guidance
        expect(notification.message).toContain('Schedule the vendor patch');
      });

      it('should use nginx-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-NGINX',
          severity: 'CRITICAL',
          cvssScore: 9.8,
          description: 'RCE in nginx.',
          affectedService: 'nginx',
        });

        expect(notification.message).toContain('Patch nginx to the recommended version');
        expect(notification.message).toContain('reload configuration');
        expect(notification.message).toContain('Check WAF rules');
      });

      it('should use apache-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-APACHE',
          severity: 'HIGH',
          cvssScore: 8.1,
          description: 'Security bypass in Apache.',
          affectedService: 'apache',
        });

        expect(notification.message).toContain('Apply the Apache HTTP Server update');
        expect(notification.message).toContain('restart gracefully');
        expect(notification.message).toContain('Verify modules');
      });

      it('should use mysql-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-MYSQL',
          severity: 'MEDIUM',
          cvssScore: 6.5,
          description: 'SQL injection in MySQL.',
          affectedService: 'mysql',
        });

        expect(notification.message).toContain('Patch the database engine');
        expect(notification.message).toContain('restart during a maintenance window');
        expect(notification.message).toContain('review replication health');
      });

      it('should use postgresql-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-PGSQL',
          severity: 'MEDIUM',
          cvssScore: 5.9,
          description: 'Auth bypass in PostgreSQL.',
          affectedService: 'postgresql',
        });

        expect(notification.message).toContain('Apply the vendor patch');
        expect(notification.message).toContain('run post-upgrade checks');
        expect(notification.message).toContain('extensions, replication, backups');
      });

      it('should use redis-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-REDIS',
          severity: 'HIGH',
          cvssScore: 7.5,
          description: 'Command injection in Redis.',
          affectedService: 'redis',
        });

        expect(notification.message).toContain('Upgrade Redis');
        expect(notification.message).toContain('rotate authentication tokens');
        expect(notification.message).toContain('confirm ACLs');
      });

      it('should use rdp-specific remediation when available', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-RDP',
          severity: 'CRITICAL',
          cvssScore: 9.8,
          description: 'RCE in RDP.',
          affectedService: 'rdp',
        });

        expect(notification.message).toContain('Patch the Windows host');
        expect(notification.message).toContain('verify NLA enforcement');
        expect(notification.message).toContain('audit remote-access policies');
      });

      it('should handle case-insensitive service matching', () => {
        const notificationUpper = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity: 'HIGH',
          cvssScore: 7.5,
          affectedService: 'SSH',
        });

        const notificationLower = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity: 'HIGH',
          cvssScore: 7.5,
          affectedService: 'ssh',
        });

        const notificationMixed = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity: 'HIGH',
          cvssScore: 7.5,
          affectedService: 'Ssh',
        });

        // All should get SSH-specific remediation
        expect(notificationUpper.message).toContain('Upgrade the SSH daemon');
        expect(notificationLower.message).toContain('Upgrade the SSH daemon');
        expect(notificationMixed.message).toContain('Upgrade the SSH daemon');
      });

      it('should match real-world service names via aliases - OpenSSH variants', () => {
        const variants = [
          'OpenSSH',
          'openssh 9.6p1',
          'OpenSSH 9.6p1 Ubuntu-3ubuntu13.3',
          'openssh/9.6p1',
        ];

        for (const variant of variants) {
          const notification = createNewCVENotification({
            cveId: 'CVE-2024-TEST',
            severity: 'HIGH',
            cvssScore: 7.5,
            affectedService: variant,
          });

          expect(notification.message).toContain('Upgrade the SSH daemon');
        }
      });

      it('should match real-world service names via aliases - Microsoft Terminal Services', () => {
        const variants = [
          'Microsoft Terminal Services',
          'microsoft terminal services',
          'ms-wbt-server',
        ];

        for (const variant of variants) {
          const notification = createNewCVENotification({
            cveId: 'CVE-2024-TEST',
            severity: 'CRITICAL',
            cvssScore: 9.8,
            affectedService: variant,
          });

          expect(notification.message).toContain('Patch the Windows host');
          expect(notification.message).toContain('verify NLA enforcement');
        }
      });

      it('should match real-world service names via aliases - Apache variants', () => {
        const variants = [
          'Apache',
          'apache httpd',
          'httpd',
          'Apache/2.4.41 (Ubuntu)',
        ];

        for (const variant of variants) {
          const notification = createNewCVENotification({
            cveId: 'CVE-2024-TEST',
            severity: 'HIGH',
            cvssScore: 8.1,
            affectedService: variant,
          });

          expect(notification.message).toContain('Apply the Apache HTTP Server update');
        }
      });

      it('should match real-world service names via aliases - PostgreSQL variants', () => {
        const variants = [
          'PostgreSQL',
          'postgres',
          'pgsql',
          'PostgreSQL 15.3',
        ];

        for (const variant of variants) {
          const notification = createNewCVENotification({
            cveId: 'CVE-2024-TEST',
            severity: 'MEDIUM',
            cvssScore: 5.9,
            affectedService: variant,
          });

          expect(notification.message).toContain('Apply the vendor patch');
          expect(notification.message).toContain('extensions, replication, backups');
        }
      });

      it('should match MariaDB to MySQL remediation', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-MARIADB',
          severity: 'MEDIUM',
          cvssScore: 6.5,
          description: 'SQL injection in MariaDB.',
          affectedService: 'mariadb',
        });

        // MariaDB is a MySQL fork, should use MySQL remediation
        expect(notification.message).toContain('Patch the database engine');
        expect(notification.message).toContain('review replication health');
      });

      it('should prefer longer alias matches (apache httpd over httpd)', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-TEST',
          severity: 'HIGH',
          cvssScore: 7.5,
          affectedService: 'apache httpd 2.4.41',
        });

        // Should match "apache httpd" not just "httpd", both map to 'apache'
        expect(notification.message).toContain('Apply the Apache HTTP Server update');
      });

      it('should fall back to severity-based guidance for unknown services', () => {
        // TODO(sec-5j6-ingest): Update this test when dynamic remediation plugin is available.
        // Currently validates fallback to static severity-based guidance.
        // Future: Should query CVE cache for vendor-provided remediation strings.

        const notification = createNewCVENotification({
          cveId: 'CVE-2024-UNKNOWN',
          severity: 'CRITICAL',
          cvssScore: 9.8,
          description: 'RCE in custom-app.',
          affectedService: 'custom-app',
        });

        // Should NOT contain service-specific guidance (regression guard)
        expect(notification.message).not.toContain('Upgrade the SSH daemon');
        expect(notification.message).not.toContain('Patch nginx');

        // Should contain severity-based guidance (current fallback behavior)
        expect(notification.message).toContain('Remediation: Apply vendor fixes immediately');

        // TODO(sec-5j6-ingest): When integrated with CVE cache, test should verify:
        // - Query to CVE cache was attempted
        // - Vendor-specific guidance is used when available
        // - Fallback still works when cache has no entry
      });
    });

    describe('CVE_SEVERITY_INCREASE remediation', () => {
      it('should append remediation to severity increase notifications', () => {
        const notification = createCVESeverityIncreaseNotification({
          cveId: 'CVE-2024-1234',
          oldSeverity: 'MEDIUM',
          newSeverity: 'CRITICAL',
          cvssScore: 9.1,
          description: 'Active exploitation detected.',
          affectedService: 'apache',
        });

        expect(notification.message).toContain('Remediation:');
        expect(notification.message).toContain('Apply the Apache HTTP Server update');
        expect(notification.message).toContain('Apply vendor fixes immediately');
      });

      it('should use new severity for remediation guidance', () => {
        const notification = createCVESeverityIncreaseNotification({
          cveId: 'CVE-2024-5678',
          oldSeverity: 'LOW',
          newSeverity: 'HIGH',
          cvssScore: 7.8,
        });

        // Should use HIGH severity guidance, not LOW
        expect(notification.message).toContain('Schedule the vendor patch or workaround as soon as possible');
        expect(notification.message).not.toContain('Review during the next scheduled update');
      });
    });

    describe('Remediation message structure', () => {
      it('should keep remediation concise (under 250 chars)', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-1234',
          severity: 'CRITICAL',
          cvssScore: 9.8,
          description: 'Test vulnerability.',
          affectedService: 'SSH',
        });

        // Extract just the remediation part
        const remediationMatch = notification.message?.match(/Remediation: (.+)/);
        const remediationText = remediationMatch ? remediationMatch[1] : '';

        expect(remediationText.length).toBeLessThan(250);
      });

      it('should format with newline before Remediation label', () => {
        const notification = createNewCVENotification({
          cveId: 'CVE-2024-1234',
          severity: 'HIGH',
          cvssScore: 7.5,
          description: 'Test vulnerability.',
        });

        // Should have description, then newline, then Remediation
        expect(notification.message).toMatch(/\n.*Remediation:/);
      });
    });
  });
});

describe('Notification Catalog - Helper Functions', () => {
  describe('mapCVESeverityToNotificationSeverity', () => {
    it('should map standard CVE severities correctly', () => {
      expect(mapCVESeverityToNotificationSeverity('CRITICAL')).toBe('CRITICAL');
      expect(mapCVESeverityToNotificationSeverity('HIGH')).toBe('HIGH');
      expect(mapCVESeverityToNotificationSeverity('MEDIUM')).toBe('MEDIUM');
      expect(mapCVESeverityToNotificationSeverity('LOW')).toBe('LOW');
    });

    it('should handle lowercase input', () => {
      expect(mapCVESeverityToNotificationSeverity('critical')).toBe('CRITICAL');
      expect(mapCVESeverityToNotificationSeverity('high')).toBe('HIGH');
      expect(mapCVESeverityToNotificationSeverity('medium')).toBe('MEDIUM');
      expect(mapCVESeverityToNotificationSeverity('low')).toBe('LOW');
    });

    it('should handle mixed case input', () => {
      expect(mapCVESeverityToNotificationSeverity('CrItIcAl')).toBe('CRITICAL');
      expect(mapCVESeverityToNotificationSeverity('HiGh')).toBe('HIGH');
    });

    it('should default to INFO for unknown severities', () => {
      expect(mapCVESeverityToNotificationSeverity('UNKNOWN')).toBe('INFO');
      expect(mapCVESeverityToNotificationSeverity('')).toBe('INFO');
      expect(mapCVESeverityToNotificationSeverity('MODERATE')).toBe('INFO');
    });
  });

  describe('getSeverityOrder', () => {
    it('should return correct order for all severities', () => {
      expect(getSeverityOrder('INFO')).toBe(0);
      expect(getSeverityOrder('LOW')).toBe(1);
      expect(getSeverityOrder('MEDIUM')).toBe(2);
      expect(getSeverityOrder('HIGH')).toBe(3);
      expect(getSeverityOrder('CRITICAL')).toBe(4);
    });

    it('should handle lowercase input', () => {
      expect(getSeverityOrder('info')).toBe(0);
      expect(getSeverityOrder('low')).toBe(1);
      expect(getSeverityOrder('medium')).toBe(2);
      expect(getSeverityOrder('high')).toBe(3);
      expect(getSeverityOrder('critical')).toBe(4);
    });

    it('should allow severity comparison', () => {
      expect(getSeverityOrder('CRITICAL')).toBeGreaterThan(getSeverityOrder('HIGH'));
      expect(getSeverityOrder('HIGH')).toBeGreaterThan(getSeverityOrder('MEDIUM'));
      expect(getSeverityOrder('MEDIUM')).toBeGreaterThan(getSeverityOrder('LOW'));
      expect(getSeverityOrder('LOW')).toBeGreaterThan(getSeverityOrder('INFO'));
    });

    it('should default to 0 for unknown severities', () => {
      expect(getSeverityOrder('UNKNOWN')).toBe(0);
      expect(getSeverityOrder('')).toBe(0);
    });

    it('should enable sorting by severity', () => {
      const severities = ['LOW', 'CRITICAL', 'MEDIUM', 'INFO', 'HIGH'];
      const sorted = severities.sort((a, b) =>
        getSeverityOrder(b) - getSeverityOrder(a)
      );

      expect(sorted).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
    });
  });
});

describe('Notification Catalog - Type System Integration', () => {
  it('should produce notifications compatible with CreateNotificationInput', () => {
    // All catalog builders should produce descriptors that match the notification schema
    const portNotification = createNewPortNotification({
      port: 22,
      protocol: 'tcp',
      service: 'ssh',
    });

    expect(portNotification).toHaveProperty('type');
    expect(portNotification).toHaveProperty('severity');
    expect(portNotification).toHaveProperty('module');
    expect(portNotification).toHaveProperty('title');
    expect(portNotification).toHaveProperty('message');

    // Type should be one of the valid notification types
    expect(['NEW_PORT', 'CLOSED_PORT', 'NEW_CVE', 'CVE_SEVERITY_INCREASE']).toContain(portNotification.type);

    // Severity should be one of the valid severities
    expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).toContain(portNotification.severity);

    // Module should be one of the valid modules
    expect(['NETWORK_SECURITY', 'VULNERABILITY_MANAGEMENT', 'GENERAL']).toContain(portNotification.module);
  });

  it('should always return non-empty titles', () => {
    const builders = [
      () => createNewPortNotification({ port: 22, protocol: 'tcp' }),
      () => createClosedPortNotification({ port: 22, protocol: 'tcp' }),
      () => createNewCVENotification({ cveId: 'CVE-2024-1234', severity: 'HIGH', cvssScore: 7.5 }),
      () => createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-1234',
        oldSeverity: 'MEDIUM',
        newSeverity: 'HIGH',
        cvssScore: 7.5
      }),
    ];

    for (const builder of builders) {
      const notification = builder();
      expect(notification.title).toBeDefined();
      expect(notification.title.length).toBeGreaterThan(0);
    }
  });
});
