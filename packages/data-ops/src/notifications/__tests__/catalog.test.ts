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
        message: 'Port 22/tcp (ssh) is no longer accessible',
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
        message: 'Port 8080/tcp (service) is no longer accessible',
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

      expect(notification).toEqual({
        type: 'NEW_CVE',
        severity: 'CRITICAL',
        module: 'VULNERABILITY_MANAGEMENT',
        title: 'New CRITICAL vulnerability CVE-2024-1234 discovered affecting nginx/1.18.0',
        message: 'CVE-2024-1234 (CVSS 9.8): Remote code execution vulnerability',
      });
    });

    it('should create notification without affected service', () => {
      const notification = createNewCVENotification({
        cveId: 'CVE-2024-5678',
        severity: 'HIGH',
        cvssScore: 7.5,
        description: 'Information disclosure vulnerability',
      });

      expect(notification).toEqual({
        type: 'NEW_CVE',
        severity: 'HIGH',
        module: 'VULNERABILITY_MANAGEMENT',
        title: 'New HIGH vulnerability CVE-2024-5678 discovered',
        message: 'CVE-2024-5678 (CVSS 7.5): Information disclosure vulnerability',
      });
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

      expect(notification).toEqual({
        type: 'CVE_SEVERITY_INCREASE',
        severity: 'CRITICAL',
        module: 'VULNERABILITY_MANAGEMENT',
        title: 'CVE-2024-1234 severity upgraded to CRITICAL affecting apache/2.4.41',
        message: 'Vulnerability CVE-2024-1234 severity increased from MEDIUM to CRITICAL (CVSS 9.1): Active exploitation detected in the wild',
      });
    });

    it('should create notification without affected service', () => {
      const notification = createCVESeverityIncreaseNotification({
        cveId: 'CVE-2024-5678',
        oldSeverity: 'LOW',
        newSeverity: 'HIGH',
        cvssScore: 7.8,
      });

      expect(notification).toEqual({
        type: 'CVE_SEVERITY_INCREASE',
        severity: 'HIGH',
        module: 'VULNERABILITY_MANAGEMENT',
        title: 'CVE-2024-5678 severity upgraded to HIGH',
        message: 'Vulnerability CVE-2024-5678 severity increased from LOW to HIGH (CVSS 7.8): No description available',
      });
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

      // Verify full integration with mapCVESeverityToNotificationSeverity
      expect(notification).toEqual({
        type: 'CVE_SEVERITY_INCREASE',
        severity: 'CRITICAL',
        module: 'VULNERABILITY_MANAGEMENT',
        title: 'CVE-2024-CASE-TEST severity upgraded to critical',
        message: 'Vulnerability CVE-2024-CASE-TEST severity increased from medium to critical (CVSS 9.2): Severity escalated due to active exploitation',
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
