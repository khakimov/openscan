import { describe, it, expect } from 'vitest';
import {
  normalizeServiceScheme,
  PORT_SCHEMES,
  getKnownPorts,
  getDefaultSchemeForPort,
} from './port-schemes';

describe('normalizeServiceScheme', () => {
  describe('known misclassifications (Step 1)', () => {
    it('fixes port 443 labeled as http', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'http')).toBe('https');
    });

    it('fixes port 993 labeled as imap', () => {
      expect(normalizeServiceScheme(993, 'tcp', 'imap')).toBe('imaps');
    });

    it('fixes port 995 labeled as pop3', () => {
      expect(normalizeServiceScheme(995, 'tcp', 'pop3')).toBe('pop3s');
    });

    it('is case-insensitive for misclassifications', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'HTTP')).toBe('https');
      expect(normalizeServiceScheme(993, 'tcp', 'IMAP')).toBe('imaps');
    });
  });

  describe('scanner-detected service names (Step 2)', () => {
    it('preserves custom service on port 443 (ssh)', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'ssh')).toBe('ssh');
    });

    it('preserves custom service on port 8443 (tomcat)', () => {
      expect(normalizeServiceScheme(8443, 'tcp', 'tomcat')).toBe('tomcat');
    });

    it('preserves meaningful service names on unknown ports', () => {
      expect(normalizeServiceScheme(9999, 'tcp', 'custom-api')).toBe('custom-api');
    });

    it('preserves service names even when port has default', () => {
      expect(normalizeServiceScheme(3306, 'tcp', 'custom-db')).toBe('custom-db');
    });
  });

  describe('port-based fallbacks (Step 3)', () => {
    it('uses http for port 80 with no service', () => {
      expect(normalizeServiceScheme(80, 'tcp')).toBe('http');
    });

    it('uses https for port 443 with generic service (tcpwrapped)', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'tcpwrapped')).toBe('https');
    });

    it('uses https for port 443 with unknown service', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'unknown')).toBe('https');
    });

    it('uses mysql for port 3306', () => {
      expect(normalizeServiceScheme(3306, 'tcp')).toBe('mysql');
    });

    it('uses postgresql for port 5432', () => {
      expect(normalizeServiceScheme(5432, 'tcp')).toBe('postgresql');
    });

    it('uses ssh for port 22', () => {
      expect(normalizeServiceScheme(22, 'tcp')).toBe('ssh');
    });

    it('uses smtp for port 25', () => {
      expect(normalizeServiceScheme(25, 'tcp')).toBe('smtp');
    });
  });

  describe('protocol fallback (Step 4)', () => {
    it('falls back to protocol for unknown ports with no service', () => {
      expect(normalizeServiceScheme(54321, 'tcp')).toBe('tcp');
      expect(normalizeServiceScheme(54321, 'udp')).toBe('udp');
    });

    it('falls back to protocol when service is generic "unknown"', () => {
      expect(normalizeServiceScheme(54321, 'tcp', 'unknown')).toBe('tcp');
    });

    it('falls back to protocol when service is generic "tcpwrapped"', () => {
      expect(normalizeServiceScheme(12345, 'tcp', 'tcpwrapped')).toBe('tcp');
    });

    it('falls back to protocol when service is empty string', () => {
      expect(normalizeServiceScheme(54321, 'tcp', '')).toBe('tcp');
    });

    it('falls back to protocol when service is "tcp" (generic)', () => {
      expect(normalizeServiceScheme(54321, 'tcp', 'tcp')).toBe('tcp');
    });
  });

  describe('edge cases', () => {
    it('handles undefined service name', () => {
      expect(normalizeServiceScheme(80, 'tcp', undefined)).toBe('http');
      expect(normalizeServiceScheme(99999, 'tcp', undefined)).toBe('tcp');
    });

    it('handles empty service name', () => {
      expect(normalizeServiceScheme(80, 'tcp', '')).toBe('http');
    });

    it('handles whitespace-only service name as empty', () => {
      // Note: Current implementation doesn't trim, so ' ' is treated as valid
      // This test documents current behavior
      expect(normalizeServiceScheme(80, 'tcp', ' ')).toBe(' ');
    });

    it('preserves case of meaningful service names', () => {
      expect(normalizeServiceScheme(9999, 'tcp', 'MyCustomService')).toBe('MyCustomService');
    });
  });

  describe('real-world scenarios', () => {
    it('handles nmap detecting Apache on port 80', () => {
      expect(normalizeServiceScheme(80, 'tcp', 'apache')).toBe('apache');
    });

    it('handles nmap detecting nginx on port 443', () => {
      expect(normalizeServiceScheme(443, 'tcp', 'nginx')).toBe('nginx');
    });

    it('handles SSH running on non-standard port 2222', () => {
      expect(normalizeServiceScheme(2222, 'tcp', 'ssh')).toBe('ssh');
    });

    it('handles database on custom port', () => {
      expect(normalizeServiceScheme(33060, 'tcp', 'mysql')).toBe('mysql');
    });

    it('handles closed/filtered ports with no service', () => {
      expect(normalizeServiceScheme(445, 'tcp')).toBe('tcp');
    });
  });
});

describe('PORT_SCHEMES registry', () => {
  it('includes web services', () => {
    expect(PORT_SCHEMES.get(80)?.defaultScheme).toBe('http');
    expect(PORT_SCHEMES.get(443)?.defaultScheme).toBe('https');
    expect(PORT_SCHEMES.get(8080)?.defaultScheme).toBe('http');
    expect(PORT_SCHEMES.get(8443)?.defaultScheme).toBe('https');
  });

  it('includes database services', () => {
    expect(PORT_SCHEMES.get(3306)?.defaultScheme).toBe('mysql');
    expect(PORT_SCHEMES.get(5432)?.defaultScheme).toBe('postgresql');
    expect(PORT_SCHEMES.get(1433)?.defaultScheme).toBe('mssql');
    expect(PORT_SCHEMES.get(27017)?.defaultScheme).toBe('mongodb');
    expect(PORT_SCHEMES.get(6379)?.defaultScheme).toBe('redis');
  });

  it('includes email services', () => {
    expect(PORT_SCHEMES.get(25)?.defaultScheme).toBe('smtp');
    expect(PORT_SCHEMES.get(465)?.defaultScheme).toBe('smtps');
    expect(PORT_SCHEMES.get(993)?.defaultScheme).toBe('imaps');
    expect(PORT_SCHEMES.get(995)?.defaultScheme).toBe('pop3s');
  });

  it('includes monitoring services', () => {
    expect(PORT_SCHEMES.get(9200)?.defaultScheme).toBe('elasticsearch');
    expect(PORT_SCHEMES.get(5601)?.defaultScheme).toBe('kibana');
    expect(PORT_SCHEMES.get(9090)?.defaultScheme).toBe('prometheus');
  });

  it('includes other common services', () => {
    expect(PORT_SCHEMES.get(22)?.defaultScheme).toBe('ssh');
    expect(PORT_SCHEMES.get(21)?.defaultScheme).toBe('ftp');
    expect(PORT_SCHEMES.get(3389)?.defaultScheme).toBe('rdp');
  });

  it('returns undefined for unknown ports', () => {
    expect(PORT_SCHEMES.get(99999)).toBeUndefined();
  });
});

describe('getKnownPorts', () => {
  it('returns all registered ports', () => {
    const ports = getKnownPorts();
    expect(ports).toContain(80);
    expect(ports).toContain(443);
    expect(ports).toContain(3306);
    expect(ports).toContain(22);
  });

  it('returns ports sorted numerically', () => {
    const ports = getKnownPorts();
    for (let i = 1; i < ports.length; i++) {
      expect(ports[i]).toBeGreaterThan(ports[i - 1]);
    }
  });

  it('returns array with expected length', () => {
    const ports = getKnownPorts();
    expect(ports.length).toBe(PORT_SCHEMES.size);
  });
});

describe('getDefaultSchemeForPort', () => {
  it('returns scheme for known ports', () => {
    expect(getDefaultSchemeForPort(80)).toBe('http');
    expect(getDefaultSchemeForPort(443)).toBe('https');
    expect(getDefaultSchemeForPort(3306)).toBe('mysql');
    expect(getDefaultSchemeForPort(22)).toBe('ssh');
  });

  it('returns undefined for unknown ports', () => {
    expect(getDefaultSchemeForPort(99999)).toBeUndefined();
    expect(getDefaultSchemeForPort(54321)).toBeUndefined();
  });

  it('handles edge case ports', () => {
    expect(getDefaultSchemeForPort(0)).toBeUndefined();
    expect(getDefaultSchemeForPort(-1)).toBeUndefined();
  });
});
